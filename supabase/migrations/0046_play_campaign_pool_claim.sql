-- =============================================================
-- 0046_play_campaign_pool_claim.sql — Coupon Drop win-mode + pooled Shopify
-- code claim, layered onto the existing play engine.
--
-- Supersedes the 6-arg play_campaign from 0022 via CREATE OR REPLACE. EVERY
-- prior behavior is preserved verbatim: rate limits, play cap, one-play
-- invariant, race-safe customer upsert, registration / return_visit / scratch /
-- prize_won / prize_lost / coupon_issued events, campaign_events emissions,
-- weighted allocation, real-pool exhaustion signal, and the won/lost return
-- shapes (all existing keys unchanged).
--
-- TWO additive changes, both gated on a campaign_coupon_configs row existing
-- (i.e. only coupon_drop campaigns are affected — every other campaign is
-- byte-identical to 0022):
--   1. win_mode='always' → the loss branch is skipped; the player always wins a
--      prize row for the reveal (fallback prize if the weighted pool is empty).
--   2. Coupon issuance first tries to CLAIM a pre-minted unique Shopify code
--      from campaign_coupon_pool (FOR UPDATE SKIP LOCKED). On success the coupon
--      is source='shopify_pool' and carries the Shopify ids. If the pool is
--      empty/absent it falls back to generate_coupon_code — source='internal'
--      for non-coupon-drop campaigns, 'internal_fallback' (needs_reconciliation)
--      when a config exists but the pool ran dry.
-- The won JSON additively includes 'campaign_id' (used for opportunistic top-up)
-- and 'source'.
-- =============================================================

-- =============================================================
-- allocate_prize_always — like allocate_prize but never returns null when ANY
-- prize is claimable: it claims a weighted non-fallback prize if one is in
-- stock, otherwise the fallback prize. Used for win_mode='always'. Pure
-- allocation (no events/plays/coupons), mirroring allocate_prize.
-- =============================================================
create or replace function allocate_prize_always(p_campaign_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prize prizes%rowtype;
  v_total_weight bigint;
  v_roll bigint;
  v_cursor bigint := 0;
  v_fallback_id uuid;
begin
  select coalesce(sum(weight), 0) into v_total_weight
    from prizes
   where campaign_id = p_campaign_id
     and weight > 0
     and not is_fallback
     and won_count < total_quantity;

  if v_total_weight > 0 then
    -- Always a win: draw within the real weight range (no losing band).
    v_roll := floor(random() * v_total_weight)::bigint;
    for v_prize in
      select * from prizes
       where campaign_id = p_campaign_id
         and weight > 0
         and not is_fallback
         and won_count < total_quantity
       order by id
    loop
      v_cursor := v_cursor + v_prize.weight;
      if v_roll < v_cursor then
        update prizes set won_count = won_count + 1
         where id = v_prize.id and won_count < total_quantity;
        if found then
          return v_prize.id;
        end if;
        exit;  -- lost the race → try fallback below
      end if;
    end loop;
  end if;

  -- No real stock (or race loss): award the fallback if configured & in stock.
  update prizes set won_count = won_count + 1
   where campaign_id = p_campaign_id and is_fallback and won_count < total_quantity
  returning id into v_fallback_id;
  return v_fallback_id;  -- null only when there is no claimable prize at all
end $$;

revoke execute on function allocate_prize_always(uuid) from public, anon, authenticated;

-- =============================================================
-- play_campaign — superseding the 0022 six-arg signature.
-- =============================================================
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
  -- 10a. Coupon Drop: try to atomically CLAIM a pre-minted unique Shopify code.
  if v_has_config then
    update campaign_coupon_pool p
       set status = 'claimed',
           claimed_by_play_id = v_play_id,
           claimed_at = now()
     where p.id = (
       select id from campaign_coupon_pool
        where campaign_id = v_campaign.id and status = 'available'
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
      -- Pool empty/absent: fall back to an internal code (customer still wins).
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
  if v_pool_id is not null and v_has_config then
    v_redeem_online := true;
    if v_config.discount_type = 'percentage' then
      v_discount_summary := trim(to_char(v_config.discount_value, 'FM990.##')) || '% off';
    elsif v_config.discount_type = 'fixed_amount' then
      v_discount_summary := coalesce(v_config.currency, 'INR') || ' ' ||
                            trim(to_char(v_config.discount_value, 'FM999999990.##')) || ' off';
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

revoke execute on function play_campaign(text, text, text, text, text, text) from public, anon, authenticated;
