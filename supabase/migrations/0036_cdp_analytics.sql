-- =============================================================
-- EngageOS CDP — Migration 0036: Per-Customer Analytics Rollup
--
-- Phase 1 of the CDP foundation. Adds a 1:1 analytics row per customer
-- holding engagement, RFM, and (reserved) commerce metrics. This is the
-- feature store the customer-360 view, segmentation, and future AI read.
--
-- Populated by recompute_customer_analytics() from the existing plays /
-- coupons / customer_events logs plus the new events stream. Commerce
-- fields default to 0/null now and are wired by the commerce phase.
--
-- STRICTLY ADDITIVE. RLS default-deny, service-role only.
-- Ordered BEFORE segmentation (0037) because assign_customer_to_segments
-- reads customer_analytics.
-- =============================================================

create table if not exists customer_analytics (
  customer_id        uuid primary key references customers(id) on delete cascade,
  business_id        uuid not null references businesses(id) on delete cascade,

  -- Commerce (reserved; populated by the commerce phase).
  total_orders       int not null default 0,
  total_spend        numeric(14,2) not null default 0,
  avg_order_value    numeric(12,2),
  first_order_at     timestamptz,
  last_order_at      timestamptz,
  purchase_frequency numeric(10,4),

  -- Engagement (from plays / coupons / customer_events / events).
  total_plays        int not null default 0,
  total_wins         int not null default 0,
  total_redemptions  int not null default 0,
  first_seen_at      timestamptz,
  last_seen_at       timestamptz,

  -- RFM + health.
  recency_days       int,
  frequency          int not null default 0,
  monetary           numeric(14,2) not null default 0,
  rfm_score          text,
  health_score       int,
  clv                numeric(14,2),

  computed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists customer_analytics_business_idx
  on customer_analytics (business_id);
create index if not exists customer_analytics_last_seen_idx
  on customer_analytics (business_id, last_seen_at desc);
create index if not exists customer_analytics_clv_idx
  on customer_analytics (business_id, clv desc);

drop trigger if exists customer_analytics_updated_at on customer_analytics;
create trigger customer_analytics_updated_at
  before update on customer_analytics
  for each row execute function set_updated_at();

alter table customer_analytics enable row level security;
revoke all on customer_analytics from anon, authenticated;

-- =============================================================
-- recompute_customer_analytics — recompute engagement + RFM for one
-- customer and upsert the row. Commerce fields are LEFT UNTOUCHED
-- (coalesced to their existing values) until the commerce phase wires
-- them. Ownership-checked via p_business_id. Service-role only.
-- =============================================================
create or replace function recompute_customer_analytics(
  p_business_id uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total_plays       int;
  v_total_wins        int;
  v_total_redemptions int;
  v_first_seen        timestamptz;
  v_last_seen         timestamptz;
  v_recency_days      int;
  v_frequency         int;
  v_monetary          numeric(14,2);
  v_rfm               text;
  v_health            int;
begin
  if not exists (
    select 1 from customers where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  select count(*), count(*) filter (where won)
    into v_total_plays, v_total_wins
    from plays
   where business_id = p_business_id and customer_id = p_customer_id;

  select count(*)
    into v_total_redemptions
    from coupons
   where business_id = p_business_id and customer_id = p_customer_id
     and status = 'redeemed';

  -- Activity window from the funnel log + universal stream.
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
  v_monetary  := v_total_wins;  -- placeholder until commerce spend lands

  -- Coarse RFM buckets (1-3 each) → 3-char score.
  v_rfm :=
    (case when v_recency_days is null then '1'
          when v_recency_days <= 7  then '3'
          when v_recency_days <= 30 then '2'
          else '1' end) ||
    (case when v_frequency >= 5 then '3'
          when v_frequency >= 2 then '2'
          else '1' end) ||
    (case when v_total_redemptions >= 3 then '3'
          when v_total_redemptions >= 1 then '2'
          else '1' end);

  v_health := least(100, greatest(0,
    coalesce(v_total_redemptions, 0) * 20 +
    coalesce(v_total_wins, 0) * 5 +
    case when v_recency_days is not null and v_recency_days <= 30 then 20 else 0 end));

  insert into customer_analytics (
    customer_id, business_id,
    total_plays, total_wins, total_redemptions,
    first_seen_at, last_seen_at,
    recency_days, frequency, monetary, rfm_score, health_score,
    computed_at
  ) values (
    p_customer_id, p_business_id,
    v_total_plays, v_total_wins, v_total_redemptions,
    v_first_seen, v_last_seen,
    v_recency_days, v_frequency, v_monetary, v_rfm, v_health,
    now()
  )
  on conflict (customer_id) do update set
    total_plays       = excluded.total_plays,
    total_wins        = excluded.total_wins,
    total_redemptions = excluded.total_redemptions,
    first_seen_at     = excluded.first_seen_at,
    last_seen_at      = excluded.last_seen_at,
    recency_days      = excluded.recency_days,
    frequency         = excluded.frequency,
    monetary          = excluded.monetary,
    rfm_score         = excluded.rfm_score,
    health_score      = excluded.health_score,
    computed_at       = excluded.computed_at;
    -- commerce columns intentionally not overwritten here
end $$;

revoke execute on function recompute_customer_analytics(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- merchant_customer_360 — one JSON bundle powering a customer-detail
-- screen: profile + latest per-channel consents + tags + analytics +
-- recent unified timeline. Ownership-scoped by p_business_id.
-- =============================================================
create or replace function merchant_customer_360(
  p_business_id uuid,
  p_customer_id uuid
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(c) - 'business_id'
      from customers c
      where c.id = p_customer_id and c.business_id = p_business_id
    ),
    'consents', (
      select coalesce(jsonb_object_agg(channel, status), '{}'::jsonb)
      from (
        select distinct on (channel) channel, status
        from customer_consents
        where business_id = p_business_id and customer_id = p_customer_id
        order by channel, consented_at desc
      ) latest
    ),
    'tags', (
      select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
      from customer_tag_map m
      join customer_tags t on t.id = m.tag_id
      where m.business_id = p_business_id and m.customer_id = p_customer_id
    ),
    'analytics', (
      select to_jsonb(a) - 'business_id'
      from customer_analytics a
      where a.customer_id = p_customer_id and a.business_id = p_business_id
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(row_to_json(tl)), '[]'::jsonb)
      from customer_timeline_unified(p_business_id, p_customer_id, 25, null) tl
    )
  );
$$;

revoke execute on function merchant_customer_360(uuid, uuid)
  from public, anon, authenticated;
