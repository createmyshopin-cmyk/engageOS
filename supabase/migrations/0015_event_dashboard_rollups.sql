-- =============================================================
-- EngageOS Release V1 — Migration 0015: Event-Sourced Dashboard Rollups
--
-- Closes GAP-1 from the production tracking audit: the merchant and
-- campaign dashboards previously counted from the plays/coupons/
-- customers tables directly, while the funnel counted from the
-- immutable event log — two sources for the same numbers. These two
-- additive read models let the dashboards read the SAME event log,
-- so every number on every dashboard has a single source of truth.
--
-- Purely additive: no existing object is altered. WhatsApp counts are
-- intentionally NOT included here — WA lifecycle is not yet event-
-- sourced (audit GAP-3, deferred), so callers keep reading wa_status.
-- Same contract as campaign_funnel: SECURITY DEFINER, tenant-scoped by
-- p_business_id, execute revoked from the public API surface.
-- =============================================================

-- =============================================================
-- business_event_totals — business-wide rollup from the event log.
-- Powers the merchant dashboard KPIs. Distinct-customer where the
-- KPI is about people; event counts where it is about actions.
-- =============================================================
create or replace function business_event_totals(p_business_id uuid)
returns table (
  customers     bigint,
  plays         bigint,
  wins          bigint,
  losses        bigint,
  coupons       bigint,
  redeemed      bigint,
  return_visits bigint
)
language sql stable security definer set search_path = public as $$
  select
    count(distinct e.customer_id) filter (where e.event_type = 'registration')  as customers,
    count(*) filter (where e.event_type = 'scratch')                            as plays,
    count(*) filter (where e.event_type = 'prize_won')                          as wins,
    count(*) filter (where e.event_type = 'prize_lost')                         as losses,
    count(*) filter (where e.event_type = 'coupon_issued')                      as coupons,
    count(*) filter (where e.event_type = 'coupon_redeemed')                    as redeemed,
    count(*) filter (where e.event_type = 'return_visit')                       as return_visits
  from customer_events e
  where e.business_id = p_business_id;
$$;

revoke execute on function business_event_totals(uuid) from public, anon, authenticated;

-- =============================================================
-- campaign_event_totals — same rollup scoped to one campaign, with
-- an ownership guard joining the campaign to p_business_id. Powers
-- the campaign detail KPIs (plays/wins/redeemed/customers) from the
-- event log instead of ad-hoc table counts.
-- =============================================================
create or replace function campaign_event_totals(p_business_id uuid, p_campaign_id uuid)
returns table (
  customers     bigint,
  plays         bigint,
  wins          bigint,
  losses        bigint,
  coupons       bigint,
  redeemed      bigint,
  return_visits bigint
)
language sql stable security definer set search_path = public as $$
  select
    count(distinct e.customer_id) filter (where e.event_type = 'registration')  as customers,
    count(*) filter (where e.event_type = 'scratch')                            as plays,
    count(*) filter (where e.event_type = 'prize_won')                          as wins,
    count(*) filter (where e.event_type = 'prize_lost')                         as losses,
    count(*) filter (where e.event_type = 'coupon_issued')                      as coupons,
    count(*) filter (where e.event_type = 'coupon_redeemed')                    as redeemed,
    count(*) filter (where e.event_type = 'return_visit')                       as return_visits
  from customer_events e
  join campaigns c on c.id = e.campaign_id
  where e.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and e.business_id = p_business_id;
$$;

revoke execute on function campaign_event_totals(uuid, uuid) from public, anon, authenticated;
