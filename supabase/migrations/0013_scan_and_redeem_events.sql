-- =============================================================
-- EngageOS Release V1 — Migration 0013: Scan & Redeem Events
--
-- Wires the two funnel endpoints that sit outside play_campaign
-- into the immutable event log:
--   * record_scan()  — QR opened (funnel entry, IP rate-limited,
--                       deduplicated so a refresh isn't a new scan)
--   * redeem_coupon() — now emits coupon_redeemed, and return_visit
--                       when the redeeming customer has prior history
-- Completes the funnel: QR Scan → Registration → Scratch → Prize
-- → Coupon → Redemption → Return Visit.
-- =============================================================

-- =============================================================
-- record_scan — funnel entry for a QR open.
-- Called from the public /c/[slug] page. There is no customer yet,
-- so the event is business/campaign-scoped with a null customer.
-- IP rate-limited and deduplicated within a short window so page
-- refreshes and bots don't inflate scan counts.
-- =============================================================
create or replace function record_scan(p_slug text, p_ip text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
begin
  -- Resolve to a live campaign; silently no-op otherwise (scans of
  -- inactive campaigns are not funnel events).
  select c.* into v_campaign from campaigns c
   where c.slug = p_slug and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return;
  end if;

  -- Dedupe: one scan per IP per campaign per 6h window. check_rate_limit
  -- returns false once the window count exceeds max; max=1 => count first
  -- open only. A refresh within the window is not re-counted.
  if not check_rate_limit('scan:' || v_campaign.id::text || ':' || p_ip, 1) then
    return;
  end if;

  perform record_customer_event(
    v_campaign.business_id, v_campaign.id, null,
    'qr_scan', null, null,
    jsonb_build_object('ip', p_ip));
end $$;

revoke execute on function record_scan(text, text) from public, anon, authenticated;

-- =============================================================
-- redeem_coupon — now event-sourced.
-- On a successful redemption emits coupon_redeemed, and return_visit
-- when this customer has an earlier redeemed coupon (a genuine repeat
-- in-store visit). Redemption logic and return shape are unchanged.
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

  -- Count this customer's prior redemptions (before marking this one).
  select count(*) into v_prior_redemptions from coupons
   where business_id = p_business_id
     and customer_id = v_coupon.customer_id
     and status = 'redeemed';

  update coupons set status = 'redeemed', redeemed_at = now()
   where id = v_coupon.id;

  select name into v_customer_name from customers where id = v_coupon.customer_id;

  -- Funnel: redemption, plus return_visit if they've redeemed before.
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

  return jsonb_build_object(
    'status', 'redeemed',
    'prize_name', v_coupon.prize_name,
    'customer_name', v_customer_name,
    'redeemed_at', now());
end $$;

revoke execute on function redeem_coupon(uuid, text) from public, anon, authenticated;
