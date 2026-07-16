-- =============================================================
-- EngageOS Release V1.1 — Migration 0018: Wire SQL engines into
-- campaign_events.
--
-- The customer-funnel events happen entirely inside SECURITY DEFINER
-- SQL engines (record_scan, play_campaign, redeem_coupon), so those
-- are the ONLY place they can be tracked. This migration re-defines
-- those three functions to ALSO append to the unified campaign_events
-- log, in the SAME transaction as the play/coupon/scan write.
--
-- Every existing behavior — invariants, return shapes, rate limits,
-- and the parallel customer_events emission — is preserved verbatim.
-- The only additions are perform record_campaign_event(...) calls, so
-- each customer funnel action creates exactly one campaign_event.
--
-- Superseding by CREATE OR REPLACE in a new migration keeps applied
-- migrations immutable (0012/0013 are never edited).
-- =============================================================

-- =============================================================
-- record_scan — funnel entry for a QR open. Now also emits
-- customer.scan into campaign_events (actor: customer, no id yet).
-- Behavior (rate-limit dedupe, live-campaign gate) unchanged.
-- =============================================================
create or replace function record_scan(p_slug text, p_ip text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
begin
  select c.* into v_campaign from campaigns c
   where c.slug = p_slug and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return;
  end if;

  if not check_rate_limit('scan:' || v_campaign.id::text || ':' || p_ip, 1) then
    return;
  end if;

  -- Existing funnel log (0011/0013): unchanged.
  perform record_customer_event(
    v_campaign.business_id, v_campaign.id, null,
    'qr_scan', null, null,
    jsonb_build_object('ip', p_ip));

  -- Unified campaign_events log (0016).
  perform record_campaign_event(
    v_campaign.business_id, v_campaign.id,
    'customer', null,
    'customer.scan',
    jsonb_build_object('slug', p_slug),
    p_ip, null);
end $$;

revoke execute on function record_scan(text, text) from public, anon, authenticated;

-- =============================================================
-- redeem_coupon — now also emits coupon.redeemed (and gift.claimed
-- for non-coupon prize types) into campaign_events. Redemption logic,
-- return shape, and customer_events emission are unchanged.
-- =============================================================
create or replace function redeem_coupon(
  p_business_id uuid,
  p_code text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_coupon coupons%rowtype;
  v_customer_name text;
  v_prior_redemptions int;
  v_prize_type text;
begin
  select * into v_coupon from coupons
   where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  if v_coupon.business_id <> p_business_id then
    return jsonb_build_object('status', 'wrong_business');
  end if;
  if v_coupon.status = 'redeemed' then
    return jsonb_build_object('status', 'already_redeemed',
                              'redeemed_at', v_coupon.redeemed_at);
  end if;
  if v_coupon.expires_at < now() or v_coupon.status = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;

  select count(*) into v_prior_redemptions from coupons
   where business_id = p_business_id
     and customer_id = v_coupon.customer_id
     and status = 'redeemed';

  update coupons set status = 'redeemed', redeemed_at = now()
   where id = v_coupon.id;

  select name into v_customer_name from customers where id = v_coupon.customer_id;
  select prize_type into v_prize_type from prizes where id = v_coupon.prize_id;

  -- Existing funnel log (0013): unchanged.
  perform record_customer_event(
    p_business_id, v_coupon.campaign_id, v_coupon.customer_id,
    'coupon_redeemed', v_coupon.prize_id, v_coupon.id,
    jsonb_build_object('code', v_coupon.code, 'prize_name', v_coupon.prize_name));

  if v_prior_redemptions > 0 then
    perform record_customer_event(
      p_business_id, v_coupon.campaign_id, v_coupon.customer_id,
      'return_visit', null, v_coupon.id,
      jsonb_build_object('prior_redemptions', v_prior_redemptions));
  end if;

  -- Unified campaign_events log (0016). Redeeming staff is the actor;
  -- staff identity is enforced upstream (staff session), so we mark the
  -- actor_type as merchant_staff with a null id (PIN-based, not a merchant row).
  perform record_campaign_event(
    p_business_id, v_coupon.campaign_id,
    'merchant_staff', null,
    'coupon.redeemed',
    jsonb_build_object(
      'couponCode', v_coupon.code,
      'rewardType', v_prize_type,
      'prizeName', v_coupon.prize_name,
      'customerId', v_coupon.customer_id,
      'customerName', v_customer_name),
    null, null);

  -- Physical/gift prize types are a fulfilled gift claim, not just a coupon.
  if v_prize_type in ('physical_gift', 'gift_voucher') then
    perform record_campaign_event(
      p_business_id, v_coupon.campaign_id,
      'merchant_staff', null,
      'gift.claimed',
      jsonb_build_object(
        'couponCode', v_coupon.code,
        'prizeName', v_coupon.prize_name,
        'prizeType', v_prize_type,
        'customerId', v_coupon.customer_id,
        'customerName', v_customer_name),
      null, null);
  end if;

  return jsonb_build_object(
    'status', 'redeemed',
    'prize_name', v_coupon.prize_name,
    'customer_name', v_customer_name,
    'redeemed_at', now());
end $$;

revoke execute on function redeem_coupon(uuid, text) from public, anon, authenticated;

-- =============================================================
-- play_campaign — now also emits the full customer-funnel slice into
-- campaign_events: customer.registered, scratch.completed,
-- prize.allocated / prize.exhausted, coupon.generated. Play logic,
-- allocation, invariants, return shape, and customer_events emission
-- are all preserved verbatim.
-- =============================================================
create or replace function play_campaign(
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_business businesses%rowtype;
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
begin
  -- 1. Rate limits: per IP and per phone.
  if not check_rate_limit('ip:' || p_ip, 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 2. Campaign must be live.
  select c.* into v_campaign from campaigns c
   where c.slug = p_campaign_slug and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  select b.* into v_business from businesses b
   where b.id = v_campaign.business_id and b.active = true;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

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
                                jsonb_build_object('name', p_name));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'customer.registered',
                                jsonb_build_object('customerName', p_name,
                                                   'returning', v_prior_plays > 0),
                                p_ip, null);
  if v_prior_plays > 0 then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'return_visit', null, null,
                                  jsonb_build_object('prior_plays', v_prior_plays));
  end if;

  -- 7. Allocate a prize via the reusable engine.
  v_prize_id := allocate_prize(v_campaign.id);
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
                                'scratch', null, null, '{}'::jsonb);
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'scratch.completed',
                                jsonb_build_object('won', v_won),
                                p_ip, null);

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null, '{}'::jsonb);
    return jsonb_build_object('status', 'ok', 'won', false);
  end if;

  -- 10. Issue the coupon in the same transaction.
  v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
  v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                     v_campaign.ends_at + interval '15 days');
  insert into coupons (business_id, campaign_id, prize_id, customer_id,
                       play_id, code, prize_name, expires_at)
  values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
          v_play_id, v_code, v_prize.name, v_expires)
  returning id into v_coupon_id;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'prize_won', v_prize.id, v_coupon_id,
                                jsonb_build_object('prize_name', v_prize.name,
                                                   'prize_type', v_prize.prize_type));
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code));

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
                                  'couponId', v_coupon_id),
                                p_ip, null);
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'coupon.generated',
                                jsonb_build_object(
                                  'couponCode', v_code,
                                  'couponId', v_coupon_id,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type),
                                p_ip, null);

  -- If that claim exhausted the real (non-fallback) prize pool, mark it.
  select coalesce(sum(greatest(total_quantity - won_count, 0)), 0)
    into v_real_remaining
    from prizes
   where campaign_id = v_campaign.id and not is_fallback;
  -- Emit only when THIS claim (a real prize) drained the pool — so a later
  -- fallback win after exhaustion does not re-emit the event every time.
  if v_real_remaining = 0 and not v_prize.is_fallback then
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'system', null,
                                  'prize.exhausted',
                                  jsonb_build_object('lastPrizeId', v_prize.id,
                                                     'lastPrizeName', v_prize.name),
                                  null, null);
  end if;

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'coupon_code', v_code,
    'expires_at', v_expires);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text) from public, anon, authenticated;
