-- =============================================================
-- EngageOS — Migration 0069: Loyalty commerce rollup + dashboard RPCs
--
-- Wires reserved commerce columns in customer_analytics from Shopify
-- orders, fixes RFM monetary to use spend, and adds merchant-facing
-- loyalty_overview / loyalty_leaderboard aggregates for /m/loyalty.
--
-- STRICTLY ADDITIVE. Service-role only.
-- =============================================================

create index if not exists customer_analytics_spend_idx
  on customer_analytics (business_id, total_spend desc);

-- =============================================================
-- recompute_customer_analytics — engagement + commerce + RFM
-- =============================================================
create or replace function recompute_customer_analytics(
  p_business_id uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total_orders        int;
  v_total_spend         numeric(14,2);
  v_avg_order_value     numeric(12,2);
  v_first_order_at      timestamptz;
  v_last_order_at       timestamptz;
  v_purchase_frequency  numeric(10,4);
  v_clv                 numeric(14,2);
  v_total_plays         int;
  v_total_wins          int;
  v_total_redemptions   int;
  v_first_seen          timestamptz;
  v_last_seen           timestamptz;
  v_recency_days        int;
  v_frequency           int;
  v_monetary            numeric(14,2);
  v_rfm                 text;
  v_health              int;
begin
  if not exists (
    select 1 from customers where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  -- Commerce rollup from paid Shopify orders.
  select count(*)::int,
         coalesce(sum(total_price), 0)::numeric(14,2),
         min(placed_at),
         max(placed_at),
         count(*) filter (
           where placed_at >= now() - interval '12 months'
         )::numeric(10,4)
    into v_total_orders, v_total_spend, v_first_order_at, v_last_order_at,
         v_purchase_frequency
    from orders
   where business_id = p_business_id
     and customer_id = p_customer_id
     and financial_status in ('paid', 'partially_paid');

  v_avg_order_value := case
    when v_total_orders > 0 then round(v_total_spend / v_total_orders, 2)
    else null
  end;
  v_clv := v_total_spend;
  v_monetary := v_total_spend;

  select count(*), count(*) filter (where won)
    into v_total_plays, v_total_wins
    from plays
   where business_id = p_business_id and customer_id = p_customer_id;

  select count(*)
    into v_total_redemptions
    from coupons
   where business_id = p_business_id and customer_id = p_customer_id
     and status = 'redeemed';

  select min(f), max(s)
    into v_first_seen, v_last_seen
    from (
      select min(created_at) f, max(created_at) s
        from customer_events
       where business_id = p_business_id and customer_id = p_customer_id
      union all
      select min(occurred_at) f, max(occurred_at) s
        from events
       where business_id = p_business_id and customer_id = p_customer_id
    ) t;

  v_recency_days := case when v_last_seen is null
                         then null
                         else floor(extract(epoch from (now() - v_last_seen)) / 86400)::int end;
  v_frequency := v_total_plays;

  v_rfm :=
    (case when v_recency_days is null then '1'
          when v_recency_days <= 7  then '3'
          when v_recency_days <= 30 then '2'
          else '1' end) ||
    (case when v_frequency >= 5 then '3'
          when v_frequency >= 2 then '2'
          else '1' end) ||
    (case when v_total_spend >= 50000 then '3'
          when v_total_spend >= 10000 then '2'
          when v_total_spend > 0 then '1'
          else '1' end);

  v_health := least(100, greatest(0,
    coalesce(v_total_redemptions, 0) * 20 +
    coalesce(v_total_wins, 0) * 5 +
    case when v_recency_days is not null and v_recency_days <= 30 then 20 else 0 end +
    case when v_total_orders >= 2 then 15 else 0 end));

  insert into customer_analytics (
    customer_id, business_id,
    total_orders, total_spend, avg_order_value,
    first_order_at, last_order_at, purchase_frequency, clv,
    total_plays, total_wins, total_redemptions,
    first_seen_at, last_seen_at,
    recency_days, frequency, monetary, rfm_score, health_score,
    computed_at
  ) values (
    p_customer_id, p_business_id,
    v_total_orders, v_total_spend, v_avg_order_value,
    v_first_order_at, v_last_order_at, v_purchase_frequency, v_clv,
    v_total_plays, v_total_wins, v_total_redemptions,
    v_first_seen, v_last_seen,
    v_recency_days, v_frequency, v_monetary, v_rfm, v_health,
    now()
  )
  on conflict (customer_id) do update set
    total_orders        = excluded.total_orders,
    total_spend         = excluded.total_spend,
    avg_order_value     = excluded.avg_order_value,
    first_order_at      = excluded.first_order_at,
    last_order_at       = excluded.last_order_at,
    purchase_frequency  = excluded.purchase_frequency,
    clv                 = excluded.clv,
    total_plays         = excluded.total_plays,
    total_wins          = excluded.total_wins,
    total_redemptions   = excluded.total_redemptions,
    first_seen_at       = excluded.first_seen_at,
    last_seen_at        = excluded.last_seen_at,
    recency_days        = excluded.recency_days,
    frequency           = excluded.frequency,
    monetary            = excluded.monetary,
    rfm_score           = excluded.rfm_score,
    health_score        = excluded.health_score,
    computed_at         = excluded.computed_at;
end $$;

revoke execute on function recompute_customer_analytics(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- recompute_business_customer_analytics — backfill all customers
-- =============================================================
create or replace function recompute_business_customer_analytics(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
begin
  for v_customer in
    select id from customers
     where business_id = p_business_id and deleted_at is null
  loop
    perform recompute_customer_analytics(p_business_id, v_customer);
  end loop;
end $$;

revoke execute on function recompute_business_customer_analytics(uuid)
  from public, anon, authenticated;

-- =============================================================
-- loyalty_overview — dashboard KPIs for /m/loyalty
-- =============================================================
create or replace function loyalty_overview(p_business_id uuid)
returns table (
  total_loyalty_members  bigint,
  active_members         bigint,
  total_points_issued    numeric,
  total_points_redeemed  numeric,
  reward_redemption_rate numeric,
  gold_count             bigint,
  silver_count           bigint,
  bronze_count           bigint,
  member_count           bigint,
  repeat_purchase_rate   numeric,
  loyalty_revenue        numeric,
  paying_customers       bigint,
  avg_customer_spend     numeric,
  top_customer_spend     numeric
)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      a.total_orders,
      a.total_spend,
      a.total_wins,
      a.total_redemptions,
      a.recency_days,
      a.last_order_at,
      a.computed_at
    from customer_analytics a
    join customers c on c.id = a.customer_id
    where a.business_id = p_business_id
      and c.business_id = p_business_id
      and c.deleted_at is null
      and (
        a.total_spend > 0
        or a.total_plays > 0
        or a.total_redemptions > 0
        or a.last_seen_at is not null
      )
  ),
  agg as (
    select
      count(*)::bigint as members,
      count(*) filter (
        where coalesce(recency_days, 9999) <= 90
           or last_order_at >= now() - interval '90 days'
      )::bigint as active,
      coalesce(sum(total_redemptions), 0)::bigint as redemptions,
      coalesce(sum(total_wins), 0)::bigint as wins,
      count(*) filter (where total_spend >= 50000)::bigint as gold,
      count(*) filter (where total_spend >= 20000 and total_spend < 50000)::bigint as silver,
      count(*) filter (where total_spend >= 5000 and total_spend < 20000)::bigint as bronze,
      count(*) filter (where total_spend > 0 and total_spend < 5000)::bigint as member,
      count(*) filter (where total_orders >= 2)::bigint as repeat_buyers,
      count(*) filter (where total_spend > 0)::bigint as paying,
      coalesce(sum(total_spend), 0)::numeric as revenue,
      coalesce(max(total_spend), 0)::numeric as top_spend
    from base
  )
  select
    members,
    active,
    0::numeric,
    0::numeric,
    case when wins > 0
         then round((redemptions::numeric / wins::numeric) * 100, 1)
         else 0 end,
    gold,
    silver,
    bronze,
    member,
    case when paying > 0
         then round((repeat_buyers::numeric / paying::numeric) * 100, 1)
         else 0 end,
    revenue,
    paying,
    case when paying > 0 then round(revenue / paying, 2) else 0 end,
    top_spend
  from agg;
$$;

revoke execute on function loyalty_overview(uuid)
  from public, anon, authenticated;

-- =============================================================
-- loyalty_leaderboard — top paying customers
-- =============================================================
create or replace function loyalty_leaderboard(
  p_business_id uuid,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  rank            bigint,
  customer_id     uuid,
  full_name       text,
  phone           text,
  total_orders    int,
  total_spend     numeric,
  avg_order_value numeric,
  last_order_at   timestamptz,
  rfm_score       text,
  health_score    int,
  clv             numeric
)
language sql stable security definer set search_path = public as $$
  select
    row_number() over (
      order by a.total_spend desc, a.last_order_at desc nulls last
    ) + p_offset as rank,
    c.id,
    coalesce(c.full_name, c.name),
    c.phone,
    a.total_orders,
    a.total_spend,
    a.avg_order_value,
    a.last_order_at,
    a.rfm_score,
    a.health_score,
    a.clv
  from customer_analytics a
  join customers c on c.id = a.customer_id
  where a.business_id = p_business_id
    and c.business_id = p_business_id
    and c.deleted_at is null
    and a.total_spend > 0
  order by a.total_spend desc, a.last_order_at desc nulls last
  limit greatest(1, least(p_limit, 50))
  offset greatest(0, p_offset);
$$;

revoke execute on function loyalty_leaderboard(uuid, int, int)
  from public, anon, authenticated;
