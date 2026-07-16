-- =============================================================
-- EngageOS — Migration 0019: Merchant-scoped campaign URLs.
--
-- The customer campaign URL moves from /c/[slug] to
-- /c/[merchantSlug]/[campaignSlug]. Tenant resolution must always use
-- BOTH slugs together, so the public SECURITY DEFINER resolvers
-- (campaign_display, record_scan, play_campaign) are re-defined to take
-- the merchant slug as well and to resolve the campaign only when it
-- belongs to the business whose businesses.slug matches.
--
-- Merchant slug (businesses.slug) is globally unique; campaign slug
-- (campaigns.slug) stays globally unique too, which is a strict superset
-- of "unique within the merchant" — so a (merchant_slug, campaign_slug)
-- pair resolves to at most one campaign, and a mismatched merchant slug
-- resolves to nothing (no cross-tenant leak via a guessed campaign slug).
--
-- Every existing behavior — invariants, return shapes, rate limits, and
-- both the customer_events and campaign_events emissions — is preserved
-- verbatim from 0018. The only change is the added merchant-slug join
-- on the initial campaign lookup. Superseding via CREATE OR REPLACE in a
-- new migration keeps applied migrations immutable.
-- =============================================================

-- =============================================================
-- campaign_display — public play-page data, now resolved by the
-- (merchant_slug, campaign_slug) pair. Prize names only, no odds/stock.
-- =============================================================
create or replace function campaign_display(p_merchant_slug text, p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'campaign_id', c.id,
    'name', c.name,
    'headline', c.headline,
    'business_name', b.name,
    'logo_url', b.logo_url,
    'ends_at', c.ends_at,
    'prizes', (select coalesce(jsonb_agg(p.name order by p.weight desc), '[]'::jsonb)
               from prizes p where p.campaign_id = c.id and p.weight > 0)
  )
  from campaigns c
  join businesses b on b.id = c.business_id
  where c.slug = p_slug
    and b.slug = p_merchant_slug
    and c.status = 'active'
    and now() between c.starts_at and c.ends_at
    and b.active = true
$$;

grant execute on function campaign_display(text, text) to anon, authenticated;
-- Retire the single-slug signature so no caller can resolve a campaign
-- without also asserting the owning merchant.
drop function if exists campaign_display(text);

-- =============================================================
-- record_scan — funnel entry for a QR open, now scoped by
-- (merchant_slug, campaign_slug). Rate-limit dedupe, live-campaign gate,
-- and both event emissions unchanged from 0018.
-- =============================================================
create or replace function record_scan(p_merchant_slug text, p_slug text, p_ip text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
begin
  select c.* into v_campaign from campaigns c
    join businesses b on b.id = c.business_id
   where c.slug = p_slug
     and b.slug = p_merchant_slug
     and c.status = 'active'
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
    jsonb_build_object('slug', p_slug, 'merchantSlug', p_merchant_slug),
    p_ip, null);
end $$;

revoke execute on function record_scan(text, text, text) from public, anon, authenticated;
drop function if exists record_scan(text, text);

-- =============================================================
-- play_campaign — executes a play, now scoped by
-- (merchant_slug, campaign_slug). Rate limits, play cap, one-play
-- invariant, prize allocation, coupon issuance, return shape, and both
-- event emissions are all preserved verbatim from 0018. The only change
-- is the merchant-slug join on the campaign lookup (step 2).
-- =============================================================
create or replace function play_campaign(
  p_merchant_slug text,
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

revoke execute on function play_campaign(text, text, text, text, text) from public, anon, authenticated;
-- Retire the single-slug play signature.
drop function if exists play_campaign(text, text, text, text);
