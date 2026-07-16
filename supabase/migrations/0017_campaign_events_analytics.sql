-- =============================================================
-- EngageOS Release V1.1 — Migration 0017: Campaign Events Analytics
--
-- Aggregate read models over the immutable campaign_events log.
-- Every dashboard number about campaign lifecycle/activity reads
-- from here — never recomputed ad hoc from operational tables when
-- an event exists.
--
-- Same contract as the rest of the schema: SECURITY DEFINER stable,
-- tenant-scoped by p_business_id (resolved from the session, never
-- the client), execute revoked from public/anon/authenticated.
-- Campaign-scoped RPCs enforce ownership by joining the campaign to
-- p_business_id so a foreign campaign_id returns nothing.
-- =============================================================

-- =============================================================
-- campaign_activity_summary — headline rollup for one campaign:
-- total events, distinct actors, first/last activity, and the
-- lifecycle-critical counts (views, scans, registrations, plays,
-- prizes, coupons, redemptions). Powers the campaign health card.
-- =============================================================
create or replace function campaign_activity_summary(
  p_business_id uuid,
  p_campaign_id uuid
) returns table (
  total_events     bigint,
  distinct_actors  bigint,
  first_activity   timestamptz,
  last_activity    timestamptz,
  views            bigint,
  scans            bigint,
  registrations    bigint,
  scratches        bigint,
  prizes           bigint,
  coupons          bigint,
  redemptions      bigint
)
language sql stable security definer set search_path = public as $$
  select
    count(*)                                                                   as total_events,
    count(distinct e.actor_id)                                                 as distinct_actors,
    min(e.created_at)                                                          as first_activity,
    max(e.created_at)                                                          as last_activity,
    count(*) filter (where e.event_type = 'campaign.viewed')                   as views,
    count(*) filter (where e.event_type = 'customer.scan')                     as scans,
    count(*) filter (where e.event_type = 'customer.registered')               as registrations,
    count(*) filter (where e.event_type = 'scratch.completed')                 as scratches,
    count(*) filter (where e.event_type = 'prize.allocated')                   as prizes,
    count(*) filter (where e.event_type = 'coupon.generated')                  as coupons,
    count(*) filter (where e.event_type = 'coupon.redeemed')                   as redemptions
  from campaign_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id;
$$;

revoke execute on function campaign_activity_summary(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- campaign_event_counts — count per event_type for one campaign.
-- Powers the "Recent Events" breakdown and event-type charts.
-- =============================================================
create or replace function campaign_event_counts(
  p_business_id uuid,
  p_campaign_id uuid
) returns table (
  event_type text,
  count      bigint
)
language sql stable security definer set search_path = public as $$
  select e.event_type, count(*) as count
  from campaign_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id
  group by e.event_type
  order by count desc, e.event_type;
$$;

revoke execute on function campaign_event_counts(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- campaign_timeline — paginated newest-first event stream for one
-- campaign. Powers the merchant + admin Campaign Timeline views.
-- Bounded limit/offset for performance (no unbounded scans).
-- =============================================================
create or replace function campaign_timeline(
  p_business_id uuid,
  p_campaign_id uuid,
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id          uuid,
  actor_type  text,
  actor_id    uuid,
  event_type  text,
  metadata    jsonb,
  ip_address  text,
  created_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.actor_type, e.actor_id, e.event_type,
         e.metadata, e.ip_address, e.created_at
  from campaign_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function campaign_timeline(uuid, uuid, int, int)
  from public, anon, authenticated;

-- =============================================================
-- campaign_conversion — the QR → redemption funnel for one campaign
-- computed from the unified event log, with derived conversion
-- rates. Distinct actors where the stage is about people.
-- =============================================================
create or replace function campaign_conversion(
  p_business_id uuid,
  p_campaign_id uuid
) returns table (
  scans             bigint,
  registrations     bigint,
  scratches         bigint,
  prizes            bigint,
  coupons           bigint,
  redemptions       bigint,
  scan_to_reg_rate  numeric,
  reg_to_play_rate  numeric,
  play_to_win_rate  numeric,
  coupon_redeem_rate numeric
)
language sql stable security definer set search_path = public as $$
  with c as (
    select
      count(*) filter (where e.event_type = 'customer.scan')       as scans,
      count(*) filter (where e.event_type = 'customer.registered') as registrations,
      count(*) filter (where e.event_type = 'scratch.completed')   as scratches,
      count(*) filter (where e.event_type = 'prize.allocated')     as prizes,
      count(*) filter (where e.event_type = 'coupon.generated')    as coupons,
      count(*) filter (where e.event_type = 'coupon.redeemed')     as redemptions
    from campaign_events e
    join campaigns ca on ca.id = e.campaign_id
    where e.campaign_id = p_campaign_id
      and ca.business_id = p_business_id
      and e.business_id = p_business_id
  )
  select
    scans, registrations, scratches, prizes, coupons, redemptions,
    round(100.0 * registrations / nullif(scans, 0), 1)      as scan_to_reg_rate,
    round(100.0 * scratches / nullif(registrations, 0), 1)  as reg_to_play_rate,
    round(100.0 * prizes / nullif(scratches, 0), 1)         as play_to_win_rate,
    round(100.0 * redemptions / nullif(coupons, 0), 1)      as coupon_redeem_rate
  from c;
$$;

revoke execute on function campaign_conversion(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- campaign_performance — per-campaign leaderboard across the whole
-- tenant in ONE round-trip (no N+1). For each campaign: lifetime
-- event volume, scans, registrations, plays, redemptions, and last
-- activity. Powers the merchant "Daily Activity" / campaign compare.
-- =============================================================
create or replace function campaign_performance(p_business_id uuid)
returns table (
  campaign_id    uuid,
  campaign_name  text,
  campaign_status text,
  total_events   bigint,
  scans          bigint,
  registrations  bigint,
  scratches      bigint,
  redemptions    bigint,
  last_activity  timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    ca.id as campaign_id,
    ca.name as campaign_name,
    ca.status as campaign_status,
    count(e.id)                                                          as total_events,
    count(*) filter (where e.event_type = 'customer.scan')              as scans,
    count(*) filter (where e.event_type = 'customer.registered')        as registrations,
    count(*) filter (where e.event_type = 'scratch.completed')          as scratches,
    count(*) filter (where e.event_type = 'coupon.redeemed')            as redemptions,
    max(e.created_at)                                                    as last_activity
  from campaigns ca
  left join campaign_events e
    on e.campaign_id = ca.id and e.business_id = p_business_id
  where ca.business_id = p_business_id
  group by ca.id, ca.name, ca.status, ca.created_at
  order by ca.created_at desc;
$$;

revoke execute on function campaign_performance(uuid)
  from public, anon, authenticated;

-- =============================================================
-- business_recent_events — the tenant-wide "Latest Activity" feed:
-- newest events across ALL campaigns, joined to the campaign name.
-- Powers the merchant dashboard Recent Events panel.
-- =============================================================
create or replace function business_recent_events(
  p_business_id uuid,
  p_limit int default 20
) returns table (
  id            uuid,
  campaign_id   uuid,
  campaign_name text,
  actor_type    text,
  event_type    text,
  metadata      jsonb,
  created_at    timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.campaign_id, ca.name as campaign_name,
         e.actor_type, e.event_type, e.metadata, e.created_at
  from campaign_events e
  left join campaigns ca on ca.id = e.campaign_id
  where e.business_id = p_business_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function business_recent_events(uuid, int)
  from public, anon, authenticated;

-- =============================================================
-- campaign_daily_activity — events-per-day for one campaign over a
-- bounded window (default 30 days). Powers the Daily Activity chart
-- and Campaign Progress sparkline. Dates are bucketed in IST so the
-- day boundaries match the merchant's calendar.
-- =============================================================
create or replace function campaign_daily_activity(
  p_business_id uuid,
  p_campaign_id uuid,
  p_days int default 30
) returns table (
  day    date,
  events bigint,
  scans  bigint,
  plays  bigint,
  redemptions bigint
)
language sql stable security definer set search_path = public as $$
  select
    (e.created_at at time zone 'Asia/Kolkata')::date               as day,
    count(*)                                                        as events,
    count(*) filter (where e.event_type = 'customer.scan')         as scans,
    count(*) filter (where e.event_type = 'scratch.completed')     as plays,
    count(*) filter (where e.event_type = 'coupon.redeemed')       as redemptions
  from campaign_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id
    and e.created_at >= now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval
  group by 1
  order by 1 desc;
$$;

revoke execute on function campaign_daily_activity(uuid, uuid, int)
  from public, anon, authenticated;

-- =============================================================
-- admin_campaign_timeline — Platform Admin can inspect ANY campaign's
-- timeline (cross-tenant). Distinct from campaign_timeline (which is
-- tenant-scoped for merchants). Still SECURITY DEFINER + execute
-- revoked; only ever called from operator-authenticated admin code.
-- =============================================================
create or replace function admin_campaign_timeline(
  p_campaign_id uuid,
  p_limit int default 100,
  p_offset int default 0
) returns table (
  id          uuid,
  business_id uuid,
  actor_type  text,
  actor_id    uuid,
  event_type  text,
  metadata    jsonb,
  ip_address  text,
  created_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.business_id, e.actor_type, e.actor_id, e.event_type,
         e.metadata, e.ip_address, e.created_at
  from campaign_events e
  where e.campaign_id = p_campaign_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function admin_campaign_timeline(uuid, int, int)
  from public, anon, authenticated;
