-- =============================================================
-- 0025_v1_1_analytics.sql — Release V1.1 merchant analytics
--
-- Additive, read-only aggregate RPCs over the immutable event logs.
-- No writes, no schema changes to frozen tables. Both are tenant-scoped
-- by an ownership join on campaigns.business_id so a foreign campaign_id
-- returns zero rows.
--
--   * reward_performance(business, campaign) — one row per reward:
--     wins, redemptions, quantity, remaining, win-share. Feeds the
--     Reward Performance / Top Rewards / Inventory Remaining panels.
--   * redirect_analytics(business, campaign) — Post Win funnel counts:
--     views, starts, opens, completes, cancels + CTR / completion rate,
--     and the most-visited destination URL. Feeds Redirect CTR /
--     Redirect Completion / Most Visited Link panels.
-- =============================================================

-- 1. reward_performance — per-reward win/redeem rollup for one campaign.
--    Wins come from prizes.won_count (engine-maintained). Redemptions come
--    from coupons.status = 'redeemed', matched to the reward by prize_name.
create or replace function reward_performance(
  p_business_id uuid,
  p_campaign_id uuid
)
returns table (
  prize_id     uuid,
  name         text,
  prize_type   text,
  is_active    boolean,
  total_quantity int,
  won_count    int,
  remaining    int,
  redeemed     bigint
)
language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.name,
    p.prize_type,
    p.is_active,
    p.total_quantity,
    p.won_count,
    greatest(p.total_quantity - p.won_count, 0) as remaining,
    coalesce(rc.redeemed, 0) as redeemed
  from prizes p
  join campaigns c on c.id = p.campaign_id and c.business_id = p_business_id
  left join (
    select prize_name, count(*) filter (where status = 'redeemed') as redeemed
    from coupons
    where campaign_id = p_campaign_id
    group by prize_name
  ) rc on rc.prize_name = p.name
  where p.campaign_id = p_campaign_id
  order by p.won_count desc, p.priority desc, p.sort_order, p.created_at;
$$;

revoke execute on function reward_performance(uuid, uuid)
  from public, anon, authenticated;

-- 2. redirect_analytics — Post Win redirect funnel for one campaign, from
--    the campaign_events log (reward.viewed + redirect.*). Returns a single
--    row of counts plus the most-visited destination URL.
create or replace function redirect_analytics(
  p_business_id uuid,
  p_campaign_id uuid
)
returns table (
  views        bigint,
  starts       bigint,
  opens        bigint,
  completes    bigint,
  cancels      bigint,
  most_visited text
)
language sql stable security definer set search_path = public as $$
  with owned as (
    select e.event_type, e.metadata
    from campaign_events e
    join campaigns c on c.id = e.campaign_id and c.business_id = p_business_id
    where e.campaign_id = p_campaign_id
  )
  select
    count(*) filter (where event_type = 'reward.viewed')       as views,
    count(*) filter (where event_type = 'redirect.started')    as starts,
    count(*) filter (where event_type = 'redirect.opened')     as opens,
    count(*) filter (where event_type = 'redirect.completed')  as completes,
    count(*) filter (where event_type = 'redirect.cancelled')  as cancels,
    (
      select o.metadata->>'url'
      from owned o
      where o.event_type = 'redirect.opened' and o.metadata->>'url' is not null
      group by o.metadata->>'url'
      order by count(*) desc
      limit 1
    ) as most_visited
  from owned;
$$;

revoke execute on function redirect_analytics(uuid, uuid)
  from public, anon, authenticated;
