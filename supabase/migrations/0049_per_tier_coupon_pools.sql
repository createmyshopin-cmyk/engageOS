-- =============================================================
-- 0047_per_tier_coupon_pools.sql — Per-tier Coupon Drop discounts.
--
-- THE BUG THIS FIXES: a coupon_drop campaign can define several prize tiers
-- (e.g. "10% OFF", "5% OFF"), but 0044-0046 modelled ONE discount per campaign:
-- one campaign_coupon_configs.discount_value, ONE Shopify parent discount, ONE
-- code pool. play_campaign claimed ANY available code regardless of which tier
-- the customer won, and derived discount_summary from the single config. Result:
-- a 5%-tier winner received a code minted from the 10% parent, and the reveal
-- showed "10% off" beside the "5% OFF" prize name. A Shopify code's percentage
-- is fixed by its parent, so the only correct fix is one parent + one pool per
-- tier, with the claim and the reveal keyed to the WON prize.
--
-- Changes (all additive / backward-compatible):
--   1. prizes gains per-tier discount_type / discount_value /
--      shopify_parent_discount_id (nullable; only set for coupon tiers on
--      coupon_drop campaigns).
--   2. campaign_coupon_pool gains prize_id — which tier a pooled code belongs to.
--   3. coupon_pool_add_codes(+p_prize_id) tags minted codes with their tier.
--   4. coupon_pool_counts(+p_prize_id) can count a single tier's pool.
--   5. play_campaign claims a code WHERE prize_id = the won prize (tier-scoped),
--      and derives discount_summary from the won prize's own discount.
--   6. Backfill: existing pools + prizes inherit the current single-config
--      discount so live campaigns keep issuing correct codes after deploy.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Per-tier discount columns on prizes.
-- -------------------------------------------------------------
alter table prizes
  add column if not exists discount_type text
    check (discount_type is null or discount_type in ('percentage', 'fixed_amount')),
  add column if not exists discount_value numeric(12,2)
    check (discount_value is null or discount_value >= 0),
  -- Each coupon tier owns its OWN Shopify parent discount (fixed %/amount). The
  -- pool codes for this tier are children of this parent.
  add column if not exists shopify_parent_discount_id text;

-- -------------------------------------------------------------
-- 2. Tag pooled codes with the tier they belong to.
-- -------------------------------------------------------------
alter table campaign_coupon_pool
  add column if not exists prize_id uuid references prizes(id) on delete cascade;

-- Tier-scoped claim: only scans a single tier's available rows, oldest first.
create index if not exists coupon_pool_tier_available_idx
  on campaign_coupon_pool (campaign_id, prize_id, created_at)
  where status = 'available';

-- -------------------------------------------------------------
-- 3. Backfill so live single-tier campaigns keep working.
--    - Give each coupon_drop campaign's coupon prizes the campaign's current
--      single discount (only where the prize has none yet).
--    - Attach existing pool rows + the existing parent to the campaign's
--      fallback prize if present, else its highest-weight coupon prize, so the
--      already-minted 10% pool stays claimable by whichever tier it represents.
-- -------------------------------------------------------------
update prizes p
   set discount_type  = coalesce(p.discount_type, cfg.discount_type),
       discount_value = coalesce(p.discount_value, cfg.discount_value)
  from campaign_coupon_configs cfg
 where cfg.campaign_id = p.campaign_id
   and p.prize_type = 'coupon'
   and p.discount_value is null;

-- Choose the "legacy tier" per campaign: the prize the existing pool maps to.
with legacy_tier as (
  select distinct on (p.campaign_id)
         p.campaign_id, p.id as prize_id
    from prizes p
    join campaign_coupon_configs cfg on cfg.campaign_id = p.campaign_id
   where p.prize_type = 'coupon'
   order by p.campaign_id, p.is_fallback desc, p.weight desc, p.id
)
update campaign_coupon_pool pool
   set prize_id = lt.prize_id
  from legacy_tier lt
 where pool.campaign_id = lt.campaign_id
   and pool.prize_id is null;

-- Point that legacy tier's prize at the existing parent discount.
with legacy_tier as (
  select distinct on (p.campaign_id)
         p.campaign_id, p.id as prize_id
    from prizes p
    join campaign_coupon_configs cfg on cfg.campaign_id = p.campaign_id
   where p.prize_type = 'coupon'
   order by p.campaign_id, p.is_fallback desc, p.weight desc, p.id
)
update prizes p
   set shopify_parent_discount_id = cfg.shopify_parent_discount_id
  from legacy_tier lt
  join campaign_coupon_configs cfg on cfg.campaign_id = lt.campaign_id
 where p.id = lt.prize_id
   and cfg.shopify_parent_discount_id is not null
   and p.shopify_parent_discount_id is null;

-- -------------------------------------------------------------
-- 4. coupon_pool_add_codes — now tags inserted codes with a tier (p_prize_id).
--    New signature (adds p_prize_id). The 0045 4-arg version is dropped so the
--    orchestrator's single call site is unambiguous.
-- -------------------------------------------------------------
drop function if exists coupon_pool_add_codes(uuid, uuid, text, jsonb);

create or replace function coupon_pool_add_codes(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id    uuid,
  p_parent_gid  text,
  p_codes       jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int := 0;
begin
  if not exists (
    select 1 from campaigns c
     where c.id = p_campaign_id and c.business_id = p_business_id
  ) then
    raise exception 'Campaign not found or access denied';
  end if;

  -- The tier must belong to this campaign (defence in depth).
  if p_prize_id is not null and not exists (
    select 1 from prizes pr where pr.id = p_prize_id and pr.campaign_id = p_campaign_id
  ) then
    raise exception 'Prize tier not found for campaign';
  end if;

  with ins as (
    insert into campaign_coupon_pool (
      business_id, campaign_id, prize_id, shopify_parent_discount_id,
      code, shopify_redeem_code_id
    )
    select
      p_business_id, p_campaign_id, p_prize_id, p_parent_gid,
      upper(trim(elem->>'code')),
      nullif(trim(coalesce(elem->>'shopify_redeem_code_id', '')), '')
    from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) as elem
    where nullif(trim(coalesce(elem->>'code', '')), '') is not null
    on conflict (campaign_id, code) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end $$;

revoke execute on function coupon_pool_add_codes(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- 5. coupon_pool_counts — optional per-tier counting via p_prize_id.
--    New signature (adds p_prize_id). When p_prize_id is null, counts the whole
--    campaign pool exactly as the 0045 version did. The 0045 2-arg version is
--    dropped so callers pass the tier explicitly.
-- -------------------------------------------------------------
drop function if exists coupon_pool_counts(uuid, uuid);

create or replace function coupon_pool_counts(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id    uuid default null
) returns table (
  available          int,
  claimed            int,
  total              int,
  pool_target        int,
  pool_low_watermark int,
  pool_status        text
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum((p.status = 'available')::int), 0)::int as available,
    coalesce(sum((p.status = 'claimed')::int), 0)::int   as claimed,
    coalesce(count(p.id), 0)::int                        as total,
    cfg.pool_target,
    cfg.pool_low_watermark,
    cfg.pool_status
  from campaign_coupon_configs cfg
  left join campaign_coupon_pool p
    on p.campaign_id = cfg.campaign_id
   and (p_prize_id is null or p.prize_id = p_prize_id)
  where cfg.campaign_id = p_campaign_id
    and cfg.business_id = p_business_id
  group by cfg.pool_target, cfg.pool_low_watermark, cfg.pool_status;
$$;

revoke execute on function coupon_pool_counts(uuid, uuid, uuid)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- 6. coupon_prize_set_parent — record a tier's Shopify parent discount id.
--    Called by the orchestrator after creating a per-tier parent. Ownership is
--    enforced by joining the prize through its campaign to p_business_id.
-- -------------------------------------------------------------
create or replace function coupon_prize_set_parent(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id    uuid,
  p_parent_gid  text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update prizes p
     set shopify_parent_discount_id = p_parent_gid
    from campaigns c
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and c.id = p.campaign_id
     and c.business_id = p_business_id;
  if not found then
    raise exception 'Prize tier not found or access denied';
  end if;
end $$;

revoke execute on function coupon_prize_set_parent(uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- 7b. merchant_update_prize — extend with per-tier discount fields so the
--     reward editor can set a coupon tier's discount_type/discount_value. The
--     0024 16-arg version is dropped and replaced with an 18-arg version.
-- -------------------------------------------------------------
drop function if exists merchant_update_prize(
  uuid, uuid, uuid, text, int, int, int, text, numeric, boolean, text, text, text,
  text, int, int
);

create or replace function merchant_update_prize(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid,
  p_name text,
  p_weight int,
  p_total_quantity int,
  p_expiry_days int,
  p_prize_type text,
  p_prize_value numeric,
  p_is_fallback boolean,
  p_image_url text,
  p_background_color text,
  p_description text,
  p_badge text,
  p_sort_order int,
  p_priority int,
  p_discount_type text default null,
  p_discount_value numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update prizes p
     set name = p_name,
         -- Only touch the live weight when the reward is active; a disabled
         -- reward keeps weight 0 and stores the new weight in active_weight.
         weight = case when p.is_active then p_weight else 0 end,
         active_weight = case when p.is_active then active_weight else p_weight end,
         total_quantity = p_total_quantity,
         expiry_days = p_expiry_days,
         prize_type = p_prize_type,
         prize_value = p_prize_value,
         discount_type = p_discount_type,
         discount_value = p_discount_value,
         is_fallback = p_is_fallback,
         image_url = p_image_url,
         background_color = p_background_color,
         description = p_description,
         badge = p_badge,
         sort_order = coalesce(p_sort_order, 0),
         priority = coalesce(p_priority, 0)
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and exists (
       select 1 from campaigns c
        where c.id = p.campaign_id
          and c.business_id = p_business_id
     );
  if not found then
    raise exception 'Reward not found or access denied';
  end if;
end $$;

revoke execute on function merchant_update_prize(
  uuid, uuid, uuid, text, int, int, int, text, numeric, boolean, text, text, text,
  text, int, int, text, numeric
) from public, anon, authenticated;

-- -------------------------------------------------------------
-- 7c. merchant_duplicate_prize — carry the per-tier discount onto the copy so a
--     duplicated coupon tier keeps its discount_type/discount_value.
-- -------------------------------------------------------------
create or replace function merchant_duplicate_prize(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new_id uuid;
begin
  insert into prizes (
    campaign_id, name, weight, total_quantity, expiry_days,
    prize_type, prize_value, discount_type, discount_value,
    is_fallback, image_url, background_color,
    description, badge, sort_order, priority, is_active, active_weight
  )
  select p.campaign_id,
         left(p.name || ' (Copy)', 60),
         0,                       -- starts out of the draw
         p.total_quantity, p.expiry_days,
         p.prize_type, p.prize_value, p.discount_type, p.discount_value,
         false,                   -- never clone a fallback flag
         p.image_url, p.background_color, p.description,
         p.badge, p.sort_order, p.priority,
         false,                   -- starts disabled
         coalesce(nullif(p.weight, 0), p.active_weight, p.weight)
    from prizes p
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and exists (
       select 1 from campaigns c
        where c.id = p.campaign_id
          and c.business_id = p_business_id
     )
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Reward not found or access denied';
  end if;
  return v_new_id;
end $$;

revoke execute on function merchant_duplicate_prize(uuid, uuid, uuid)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- 7. play_campaign — supersede 0046. ONLY two lines of behaviour change vs 0046:
--      (a) the pool claim is now tier-scoped: WHERE prize_id = the won prize;
--      (b) discount_summary is derived from the WON prize's own discount, with a
--          fallback to the campaign config for legacy single-tier campaigns.
--    Everything else is copied verbatim from 0046.
-- -------------------------------------------------------------
create or replace function play_campaign(
  p_merchant_slug text,
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text,
  p_source text default 'direct'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_business businesses%rowtype;
  v_config campaign_coupon_configs%rowtype;
  v_has_config boolean := false;
  v_customer_id uuid;
  v_prior_plays int;
  v_play_count int;
  v_prize prizes%rowtype;
  v_prize_id uuid;
  v_won boolean := false;
  v_play_id uuid;
  v_coupon_id uuid;
  v_code text;
  v_expires timestamptz;
  v_real_remaining int;
  v_source text := coalesce(nullif(trim(p_source), ''), 'direct');
  -- Pool-claim locals.
  v_pool_id uuid;
  v_pool_code text;
  v_pool_parent text;
  v_pool_redeem text;
  v_coupon_source text := 'internal';
  v_needs_recon boolean := false;
  -- Reveal enrichment for redeemable-online (coupon_drop) codes.
  v_redeem_online boolean := false;
  v_discount_summary text;
  v_store_url text;
  -- Effective discount for the reveal: the won prize's own, else the config's.
  v_disc_type text;
  v_disc_value numeric;
begin
  -- 1. Rate limits: per IP and per phone.
  if not check_rate_limit('ip:' || p_ip, 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 2. Campaign must be live AND belong to the named merchant.
  select c.* into v_campaign from campaigns c
    join businesses b on b.id = c.business_id
   where c.slug = p_campaign_slug
     and b.slug = p_merchant_slug
     and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  select b.* into v_business from businesses b
   where b.id = v_campaign.business_id and b.active = true;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  -- Coupon Drop config (absent for every other campaign type → legacy path).
  select * into v_config from campaign_coupon_configs
   where campaign_id = v_campaign.id;
  v_has_config := found;

  -- 3. Campaign-wide play cap (fraud control). Null = unlimited.
  if v_campaign.play_limit is not null then
    select count(*) into v_play_count from plays where campaign_id = v_campaign.id;
    if v_play_count >= v_campaign.play_limit then
      return jsonb_build_object('status', 'campaign_full');
    end if;
  end if;

  -- 4. Upsert customer (race-safe via ON CONFLICT, as in 0001).
  insert into customers (business_id, phone, name)
  values (v_campaign.business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id into v_customer_id;

  select count(*) into v_prior_plays from plays
   where business_id = v_campaign.business_id and customer_id = v_customer_id;

  -- 5. One play per campaign (unique index is the backstop).
  if exists (select 1 from plays
              where campaign_id = v_campaign.id and customer_id = v_customer_id) then
    return jsonb_build_object('status', 'already_played');
  end if;

  -- 6. Funnel: registration (+ return_visit for existing customers).
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'registration', null, null,
                                jsonb_build_object('name', p_name, 'source', v_source));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'customer.registered',
                                jsonb_build_object('customerName', p_name,
                                                   'returning', v_prior_plays > 0,
                                                   'source', v_source),
                                p_ip, null);
  if v_prior_plays > 0 then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'return_visit', null, null,
                                  jsonb_build_object('prior_plays', v_prior_plays, 'source', v_source));
  end if;

  -- 7. Allocate a prize. win_mode='always' (coupon_drop only) never loses.
  if v_has_config and v_config.win_mode = 'always' then
    v_prize_id := allocate_prize_always(v_campaign.id);
  else
    v_prize_id := allocate_prize(v_campaign.id);
  end if;
  if v_prize_id is not null then
    select * into v_prize from prizes where id = v_prize_id;
    v_won := true;
  end if;

  -- 8. Record the play.
  insert into plays (campaign_id, business_id, customer_id, won, prize_id)
  values (v_campaign.id, v_campaign.business_id, v_customer_id, v_won, v_prize_id)
  returning id into v_play_id;

  -- 9. Funnel: scratch + prize outcome.
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'scratch', null, null,
                                jsonb_build_object('source', v_source));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'scratch.completed',
                                jsonb_build_object('won', v_won, 'source', v_source),
                                p_ip, null);

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null,
                                  jsonb_build_object('source', v_source));
    return jsonb_build_object('status', 'ok', 'won', false);
  end if;

  -- 10. Issue the coupon in the same transaction.
  -- 10a. Coupon Drop: try to atomically CLAIM a pre-minted unique Shopify code
  --      FROM THE WON TIER's pool (prize_id = v_prize_id). A tier whose own pool
  --      is dry falls back to an internal code — it never borrows another tier's
  --      code, which would carry the wrong discount.
  if v_has_config then
    update campaign_coupon_pool p
       set status = 'claimed',
           claimed_by_play_id = v_play_id,
           claimed_at = now()
     where p.id = (
       select id from campaign_coupon_pool
        where campaign_id = v_campaign.id
          and prize_id = v_prize_id
          and status = 'available'
        order by created_at
        for update skip locked
        limit 1
     )
    returning p.id, p.code, p.shopify_parent_discount_id, p.shopify_redeem_code_id
      into v_pool_id, v_pool_code, v_pool_parent, v_pool_redeem;

    if v_pool_id is not null then
      v_code := v_pool_code;
      v_coupon_source := 'shopify_pool';
    else
      -- Tier pool empty/absent: fall back to an internal code (customer still wins).
      v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
      v_coupon_source := 'internal_fallback';
      v_needs_recon := true;
    end if;
  else
    -- Legacy path (every non-coupon-drop campaign): identical to 0022.
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal';
  end if;

  v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                     v_campaign.ends_at + interval '15 days');
  insert into coupons (business_id, campaign_id, prize_id, customer_id,
                       play_id, code, prize_name, expires_at,
                       source, pool_id, shopify_parent_discount_id,
                       shopify_discount_code_id, needs_reconciliation)
  values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
          v_play_id, v_code, v_prize.name, v_expires,
          v_coupon_source, v_pool_id, v_pool_parent,
          v_pool_redeem, v_needs_recon)
  returning id into v_coupon_id;

  -- Backfill the pool row's coupon link (nothing to do on the fallback path).
  if v_pool_id is not null then
    update campaign_coupon_pool
       set claimed_by_coupon_id = v_coupon_id
     where id = v_pool_id;
  end if;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'prize_won', v_prize.id, v_coupon_id,
                                jsonb_build_object('prize_name', v_prize.name,
                                                   'prize_type', v_prize.prize_type,
                                                   'source', v_source));
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code, 'source', v_source,
                                                   'coupon_source', v_coupon_source));

  -- Unified campaign_events log (0016): prize allocation + coupon generation.
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'prize.allocated',
                                jsonb_build_object(
                                  'customerId', v_customer_id,
                                  'customerName', p_name,
                                  'prizeId', v_prize.id,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'couponId', v_coupon_id,
                                  'source', v_source),
                                p_ip, null);
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'coupon.generated',
                                jsonb_build_object(
                                  'couponCode', v_code,
                                  'couponId', v_coupon_id,
                                  'couponSource', v_coupon_source,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'source', v_source),
                                p_ip, null);

  -- If that claim exhausted the real (non-fallback) prize pool, mark it.
  select coalesce(sum(greatest(total_quantity - won_count, 0)), 0)
    into v_real_remaining
    from prizes
   where campaign_id = v_campaign.id and not is_fallback;
  if v_real_remaining = 0 and not v_prize.is_fallback then
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'system', null,
                                  'prize.exhausted',
                                  jsonb_build_object('lastPrizeId', v_prize.id,
                                                     'lastPrizeName', v_prize.name),
                                  null, null);
  end if;

  -- Reveal enrichment: a claimed pool code is redeemable online at the store.
  -- The summary reflects the WON tier's discount (v_prize), falling back to the
  -- campaign config for legacy single-tier campaigns where the prize has none.
  if v_pool_id is not null and v_has_config then
    v_redeem_online := true;
    v_disc_type  := coalesce(v_prize.discount_type, v_config.discount_type);
    v_disc_value := coalesce(v_prize.discount_value, v_config.discount_value);
    if v_disc_type = 'percentage' then
      v_discount_summary := trim(to_char(v_disc_value, 'FM990.##')) || '% off';
    elsif v_disc_type = 'fixed_amount' then
      v_discount_summary := coalesce(v_config.currency, 'INR') || ' ' ||
                            trim(to_char(v_disc_value, 'FM999999990.##')) || ' off';
    end if;
    select 'https://' || s.shop_domain into v_store_url
      from shopify_shops s
     where s.business_id = v_campaign.business_id
     order by s.installed_at
     limit 1;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'campaign_id', v_campaign.id,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'prize_image_url', v_prize.image_url,
    'prize_background_color', v_prize.background_color,
    'coupon_code', v_code,
    'coupon_source', v_coupon_source,
    'redeem_online', v_redeem_online,
    'discount_summary', v_discount_summary,
    'store_url', v_store_url,
    'expires_at', v_expires);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;
