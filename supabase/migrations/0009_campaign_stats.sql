-- =============================================================
-- EngageOS — Migration 0009: Campaign stats aggregate
--
-- Replaces the per-campaign N+1 fan-out in the merchant Campaigns
-- list and dashboard (6-7 count queries PER campaign) with ONE
-- set-returning function. Tenant-scoped by p_business_id, which the
-- caller resolves from the authenticated session (never the URL).
--
-- SECURITY DEFINER + service-role only, matching the rest of the
-- schema. Every aggregate is filtered to campaigns owned by the
-- passed business_id, so cross-tenant rows can never be counted.
-- =============================================================

create or replace function campaign_stats_for_business(p_business_id uuid)
returns table (
  campaign_id       uuid,
  plays             bigint,
  wins              bigint,
  redeemed          bigint,
  wa_sent           bigint,
  wa_failed         bigint,
  remaining_coupons bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id as campaign_id,
    coalesce(pl.plays, 0)        as plays,
    coalesce(pl.wins, 0)         as wins,
    coalesce(co.redeemed, 0)     as redeemed,
    coalesce(co.wa_sent, 0)      as wa_sent,
    coalesce(co.wa_failed, 0)    as wa_failed,
    coalesce(pz.remaining, 0)    as remaining_coupons
  from campaigns c
  left join lateral (
    select
      count(*)                              as plays,
      count(*) filter (where p.won)         as wins
    from plays p
    where p.campaign_id = c.id
  ) pl on true
  left join lateral (
    select
      count(*) filter (where cp.status = 'redeemed')  as redeemed,
      count(*) filter (where cp.wa_status = 'sent')   as wa_sent,
      count(*) filter (where cp.wa_status = 'failed') as wa_failed
    from coupons cp
    where cp.campaign_id = c.id
  ) co on true
  left join lateral (
    select count(*) as remaining
    from prizes pr
    where pr.campaign_id = c.id
  ) pz on true
  where c.business_id = p_business_id;
$$;

revoke execute on function campaign_stats_for_business(uuid)
  from public, anon, authenticated;
