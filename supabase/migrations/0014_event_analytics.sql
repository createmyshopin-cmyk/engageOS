-- =============================================================
-- EngageOS Release V1 — Migration 0014: Event-Sourced Analytics
--
-- Read models over the immutable customer_events log + prizes.
-- Merchant analytics read from these instead of recomputing from
-- raw plays/coupons ad hoc. All tenant-scoped by p_business_id
-- (resolved from the session, never the URL), SECURITY DEFINER,
-- service-role only — same contract as campaign_stats_for_business.
-- =============================================================

-- =============================================================
-- campaign_funnel — the QR → Redemption funnel for one campaign,
-- counted from the event log. Each stage is a distinct-customer or
-- event count so merchants see true stage-to-stage drop-off.
-- Ownership is enforced by joining the campaign to p_business_id.
-- =============================================================
create or replace function campaign_funnel(p_business_id uuid, p_campaign_id uuid)
returns table (
  scans         bigint,
  registrations bigint,
  scratches     bigint,
  prizes_won    bigint,
  coupons       bigint,
  redemptions   bigint,
  return_visits bigint
)
language sql stable security definer set search_path = public as $$
  select
    count(*) filter (where e.event_type = 'qr_scan')                             as scans,
    count(distinct e.customer_id) filter (where e.event_type = 'registration')   as registrations,
    count(*) filter (where e.event_type = 'scratch')                             as scratches,
    count(*) filter (where e.event_type = 'prize_won')                           as prizes_won,
    count(*) filter (where e.event_type = 'coupon_issued')                       as coupons,
    count(*) filter (where e.event_type = 'coupon_redeemed')                     as redemptions,
    count(*) filter (where e.event_type = 'return_visit')                        as return_visits
  from customer_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id;
$$;

revoke execute on function campaign_funnel(uuid, uuid) from public, anon, authenticated;

-- =============================================================
-- customer_timeline — one customer's full event history for the
-- business, newest first. Powers the customer_events timeline view.
-- =============================================================
create or replace function customer_timeline(p_business_id uuid, p_customer_id uuid)
returns table (
  id          uuid,
  event_type  text,
  campaign_id uuid,
  prize_id    uuid,
  coupon_id   uuid,
  metadata    jsonb,
  created_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.event_type, e.campaign_id, e.prize_id, e.coupon_id,
         e.metadata, e.created_at
  from customer_events e
  where e.business_id = p_business_id
    and e.customer_id = p_customer_id
  order by e.created_at desc, e.id desc;
$$;

revoke execute on function customer_timeline(uuid, uuid) from public, anon, authenticated;

-- =============================================================
-- live_winners — most recent prize_won events across the business,
-- joined to the customer, campaign, and prize for a live feed.
-- Reads the event log, so it reflects exactly what was awarded.
-- =============================================================
create or replace function live_winners(p_business_id uuid, p_limit int default 50)
returns table (
  event_id      uuid,
  customer_name text,
  customer_phone text,
  campaign_name text,
  prize_name    text,
  prize_type    text,
  prize_value   numeric,
  coupon_code   text,
  won_at        timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    e.id as event_id,
    cu.name as customer_name,
    cu.phone as customer_phone,
    ca.name as campaign_name,
    coalesce(pz.name, e.metadata->>'prize_name') as prize_name,
    pz.prize_type,
    pz.prize_value,
    cp.code as coupon_code,
    e.created_at as won_at
  from customer_events e
  left join customers cu on cu.id = e.customer_id
  left join campaigns ca on ca.id = e.campaign_id
  left join prizes pz on pz.id = e.prize_id
  left join coupons cp on cp.id = e.coupon_id
  where e.business_id = p_business_id
    and e.event_type = 'prize_won'
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function live_winners(uuid, int) from public, anon, authenticated;

-- =============================================================
-- gift_inventory — per-prize stock across the business's live-ish
-- campaigns: total, awarded, remaining, plus type/value/fallback.
-- Powers the Gift Inventory dashboard. Prizes carry no business_id,
-- so tenant scope comes from the campaign join.
-- =============================================================
create or replace function gift_inventory(p_business_id uuid)
returns table (
  prize_id       uuid,
  campaign_id    uuid,
  campaign_name  text,
  campaign_status text,
  prize_name     text,
  prize_type     text,
  prize_value    numeric,
  is_fallback    boolean,
  weight         int,
  total_quantity int,
  won_count      int,
  remaining      int
)
language sql stable security definer set search_path = public as $$
  select
    pz.id as prize_id,
    ca.id as campaign_id,
    ca.name as campaign_name,
    ca.status as campaign_status,
    pz.name as prize_name,
    pz.prize_type,
    pz.prize_value,
    pz.is_fallback,
    pz.weight,
    pz.total_quantity,
    pz.won_count,
    greatest(pz.total_quantity - pz.won_count, 0) as remaining
  from prizes pz
  join campaigns ca on ca.id = pz.campaign_id
  where ca.business_id = p_business_id
  order by ca.created_at desc, pz.is_fallback, pz.weight desc, pz.created_at;
$$;

revoke execute on function gift_inventory(uuid) from public, anon, authenticated;
