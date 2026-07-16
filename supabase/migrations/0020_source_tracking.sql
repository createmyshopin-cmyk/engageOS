-- =============================================================
-- EngageOS Release V1 — Migration 0020: Lightweight Source Tracking
--
-- Adds an OPTIONAL traffic-source tag to the customer funnel. A play
-- page opened as /c/<merchant>/<campaign>?src=<source_name> carries the
-- source through the scan and play engines, which persist it in the
-- customer_events metadata (key: "source"). When src is missing it is
-- stored as "direct" so every event has a bucket.
--
-- Fully additive:
--   - record_scan / play_campaign gain a trailing p_source param with a
--     'direct' default, so every existing caller and signature keeps
--     working unchanged. Superseding via CREATE OR REPLACE keeps applied
--     migrations (0018/0019) immutable.
--   - No new tables. Source lives only in customer_events.metadata.
--   - traffic_sources is a new read-only, tenant-scoped aggregate RPC.
--
-- The source is associated with the play through the funnel events the
-- play emits (registration / scratch / prize_won), all stamped with the
-- same source. Redemptions — which happen later without source context —
-- are attributed back to the source recorded on the customer's
-- registration event for that campaign.
-- =============================================================

-- =============================================================
-- record_scan — now also stamps the traffic source onto the qr_scan
-- customer_event metadata (and the campaign_events payload). Rate-limit
-- dedupe, live-campaign gate, and merchant-slug scoping are unchanged
-- from 0019.
-- =============================================================
create or replace function record_scan(
  p_merchant_slug text,
  p_slug text,
  p_ip text,
  p_source text default 'direct'
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_source text := coalesce(nullif(trim(p_source), ''), 'direct');
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

  -- Funnel log (0011/0013), now tagged with the traffic source.
  perform record_customer_event(
    v_campaign.business_id, v_campaign.id, null,
    'qr_scan', null, null,
    jsonb_build_object('ip', p_ip, 'source', v_source));

  -- Unified campaign_events log (0016).
  perform record_campaign_event(
    v_campaign.business_id, v_campaign.id,
    'customer', null,
    'customer.scan',
    jsonb_build_object('slug', p_slug, 'merchantSlug', p_merchant_slug,
                       'source', v_source),
    p_ip, null);
end $$;

revoke execute on function record_scan(text, text, text, text) from public, anon, authenticated;
-- Retire the source-less signature so the source always flows through.
drop function if exists record_scan(text, text, text);

-- =============================================================
-- play_campaign — now also stamps the traffic source onto every funnel
-- customer_event it emits (registration, scratch, prize_won,
-- coupon_issued) so the source is associated with the play. Rate limits,
-- play cap, one-play invariant, prize allocation, coupon issuance, return
-- shape, and all campaign_events emissions are preserved verbatim from
-- 0019. Only the added p_source (default 'direct') and the 'source' keys
-- in the customer_event metadata are new.
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
                                                   'prize_type', v_prize.prize_type,
                                                   'source', v_source));
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code, 'source', v_source));

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

revoke execute on function play_campaign(text, text, text, text, text, text) from public, anon, authenticated;
-- Retire the source-less play signature.
drop function if exists play_campaign(text, text, text, text, text);

-- =============================================================
-- traffic_sources — tenant-scoped aggregate over the customer_events
-- log, one row per traffic source, with the six funnel metrics:
--   source, qr_scans, registrations, plays, wins, redemptions.
--
-- Source is read from customer_events.metadata->>'source' (defaulting to
-- 'direct'). Redemptions carry no source of their own, so each redeemed
-- coupon is attributed to the source recorded on its customer's
-- registration event for that campaign. Ownership is enforced by the
-- p_business_id scope (resolved from the session, never the URL).
-- =============================================================
create or replace function traffic_sources(p_business_id uuid)
returns table (
  source        text,
  qr_scans      bigint,
  registrations bigint,
  plays         bigint,
  wins          bigint,
  redemptions   bigint
)
language sql stable security definer set search_path = public as $$
  with ev as (
    select
      coalesce(nullif(e.metadata->>'source', ''), 'direct') as source,
      e.event_type,
      e.campaign_id,
      e.customer_id,
      e.coupon_id
    from customer_events e
    where e.business_id = p_business_id
  ),
  -- Source recorded on each customer's registration, per campaign. Used to
  -- attribute later redemptions (which have no source of their own).
  reg_source as (
    select distinct on (campaign_id, customer_id)
      campaign_id, customer_id, source
    from ev
    where event_type = 'registration' and customer_id is not null
    order by campaign_id, customer_id
  ),
  scans as (
    select source, count(*) as n from ev
    where event_type = 'qr_scan' group by source
  ),
  regs as (
    select source, count(*) as n from ev
    where event_type = 'registration' group by source
  ),
  plays_agg as (
    select source, count(*) as n from ev
    where event_type = 'scratch' group by source
  ),
  wins as (
    select source, count(*) as n from ev
    where event_type = 'prize_won' group by source
  ),
  redemptions as (
    select coalesce(rs.source, 'direct') as source, count(*) as n
    from ev r
    left join reg_source rs
      on rs.campaign_id = r.campaign_id and rs.customer_id = r.customer_id
    where r.event_type = 'coupon_redeemed'
    group by coalesce(rs.source, 'direct')
  ),
  sources as (
    select source from scans
    union select source from regs
    union select source from plays_agg
    union select source from wins
    union select source from redemptions
  )
  select
    s.source,
    coalesce(sc.n, 0) as qr_scans,
    coalesce(rg.n, 0) as registrations,
    coalesce(pl.n, 0) as plays,
    coalesce(wn.n, 0) as wins,
    coalesce(rd.n, 0) as redemptions
  from sources s
  left join scans sc       on sc.source = s.source
  left join regs rg        on rg.source = s.source
  left join plays_agg pl   on pl.source = s.source
  left join wins wn        on wn.source = s.source
  left join redemptions rd on rd.source = s.source
  order by qr_scans desc, registrations desc, s.source;
$$;

revoke execute on function traffic_sources(uuid) from public, anon, authenticated;
