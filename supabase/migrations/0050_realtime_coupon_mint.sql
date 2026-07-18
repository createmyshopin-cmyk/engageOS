-- =============================================================
-- 0050_realtime_coupon_mint.sql
-- Real-time per-customer Shopify coupon minting.
--
-- Replaces the pre-minted POOL model (0044–0049) with real-time minting:
--   * At play time, play_campaign always issues an internal code using the
--     campaign's CUSTOM coupon_prefix (generate_coupon_code) and flags it
--     needs_reconciliation. It no longer claims from campaign_coupon_pool.
--   * The play route then attaches that exact code to the won tier's Shopify
--     parent discount (off the response path) and calls coupon_link_shopify to
--     record the Shopify redeem-code id on the coupon row.
--   * If Shopify minting fails, the customer keeps the internal fallback code —
--     a win is never blocked.
--
-- Why: pool codes used a UUID-derived prefix (never the merchant's custom
-- prefix) and only existed if the activation-time bulk mint succeeded, so
-- winners saw codes that didn't match the configured name and weren't always in
-- Shopify. Real-time minting makes the customer-facing code = custom prefix and
-- guarantees it is created in Shopify at the moment it's won.
--
-- Additive & reversible: campaign_coupon_pool and its RPCs are left in place
-- (unused for new plays). Non-coupon-drop campaigns hit the identical legacy
-- path. Both new/changed functions are security definer, tenant-guarded, with
-- execute revoked from public/anon/authenticated.
-- =============================================================

-- -------------------------------------------------------------
-- 0. Allow the new coupon source value. 0044 constrained coupons.source to
--    ('internal','shopify_pool','internal_fallback'); real-time mints add
--    'shopify_realtime'. Drop and recreate the CHECK (idempotent-safe).
-- -------------------------------------------------------------
alter table coupons drop constraint if exists coupons_source_check;
alter table coupons add constraint coupons_source_check
  check (source in ('internal','shopify_pool','internal_fallback','shopify_realtime'));

-- -------------------------------------------------------------
-- 1. coupon_link_shopify — record the real-time Shopify mint on a coupon row.
--    Called by the play route after it attaches the code to the tier's parent
--    discount. Tenant ownership enforced via the campaigns→business join.
-- -------------------------------------------------------------
create or replace function coupon_link_shopify(
  p_business_id uuid,
  p_coupon_id uuid,
  p_redeem_id text,
  p_parent_gid text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update coupons c
     set shopify_discount_code_id = p_redeem_id,
         shopify_parent_discount_id = coalesce(p_parent_gid, c.shopify_parent_discount_id),
         source = 'shopify_realtime',
         needs_reconciliation = false
   where c.id = p_coupon_id
     and c.business_id = p_business_id
     and exists (
       select 1 from campaigns cm
        where cm.id = c.campaign_id
          and cm.business_id = p_business_id
     );
end $$;

revoke execute on function coupon_link_shopify(uuid, uuid, text, text)
  from public, anon, authenticated;

-- -------------------------------------------------------------
-- 2. play_campaign — real-time coupon issue.
--    Copied verbatim from 0049 EXCEPT the step-10 coupon-drop branch (no pool
--    claim; always custom-prefixed internal code awaiting real-time mint) and
--    the reveal enrichment (derived from the won tier directly, gated on
--    v_has_config rather than a claimed pool row). The returned payload now
--    carries prize_id and the won tier's shopify_parent_discount_id so the
--    route can mint against the correct parent and link the coupon back.
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
  -- Coupon linkage locals (real-time mint fills shopify ids afterwards).
  v_parent_gid text;
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
  -- 10a. Coupon Drop: issue a unique code using the campaign's CUSTOM prefix and
  --      mark it for reconciliation. The play route mints this exact code in
  --      Shopify (against the won tier's parent discount) off the response path
  --      and calls coupon_link_shopify to fill in the Shopify ids. If that mint
  --      fails, the customer keeps this internal code (a win is never blocked).
  --      v_parent_gid is the won tier's parent discount, returned so the route
  --      knows where to attach the code.
  if v_has_config then
    v_parent_gid := v_prize.shopify_parent_discount_id;
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal_fallback';
    v_needs_recon := true;
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
          v_coupon_source, null, v_parent_gid,
          null, v_needs_recon)
  returning id into v_coupon_id;

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

  -- Reveal enrichment: a coupon_drop win is redeemable online at the store when
  -- its tier has a Shopify parent discount (i.e. real-time minting can attach
  -- the code). The summary reflects the WON tier's discount (v_prize), falling
  -- back to the campaign config for legacy single-tier campaigns.
  if v_has_config then
    v_redeem_online := v_parent_gid is not null;
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
    'prize_id', v_prize.id,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'prize_image_url', v_prize.image_url,
    'prize_background_color', v_prize.background_color,
    'coupon_id', v_coupon_id,
    'coupon_code', v_code,
    'coupon_source', v_coupon_source,
    'shopify_parent_discount_id', v_parent_gid,
    'redeem_online', v_redeem_online,
    'discount_summary', v_discount_summary,
    'store_url', v_store_url,
    'expires_at', v_expires);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text, text, text)
  from public, anon, authenticated;
