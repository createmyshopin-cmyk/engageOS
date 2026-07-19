-- =============================================================
-- EngageOS — Migration 0071: Membership tiers + points-based ranking
--
-- membership_tiers + customer_memberships, auto tier recompute on earn,
-- points-based tier distribution in loyalty_overview, tier on wallet/
-- leaderboard. Merchant rules/tiers list+update RPCs.
-- =============================================================

-- ── membership_tiers ─────────────────────────────────────────
create table if not exists membership_tiers (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  slug             text not null,
  name             text not null,
  min_points       int not null default 0,
  max_points       int,
  color            text not null default '#78716c',
  icon             text not null default 'award',
  bonus_multiplier numeric(5,2) not null default 1,
  benefits         jsonb not null default '[]'::jsonb,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists membership_tiers_business_sort_idx
  on membership_tiers (business_id, sort_order);

drop trigger if exists membership_tiers_updated_at on membership_tiers;
create trigger membership_tiers_updated_at
  before update on membership_tiers
  for each row execute function set_updated_at();

alter table membership_tiers enable row level security;
revoke all on membership_tiers from anon, authenticated;

-- ── customer_memberships ─────────────────────────────────────
create table if not exists customer_memberships (
  customer_id      uuid primary key references customers(id) on delete cascade,
  business_id      uuid not null references businesses(id) on delete cascade,
  tier_id          uuid not null references membership_tiers(id) on delete restrict,
  lifetime_points  int not null default 0,
  achieved_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists customer_memberships_business_tier_idx
  on customer_memberships (business_id, tier_id);

drop trigger if exists customer_memberships_updated_at on customer_memberships;
create trigger customer_memberships_updated_at
  before update on customer_memberships
  for each row execute function set_updated_at();

alter table customer_memberships enable row level security;
revoke all on customer_memberships from anon, authenticated;

-- ── ensure_default_membership_tiers ──────────────────────────
create or replace function ensure_default_membership_tiers(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into membership_tiers (
    business_id, slug, name, min_points, max_points, color, icon,
    bonus_multiplier, benefits, sort_order
  ) values
    (p_business_id, 'bronze',   'Bronze',   0,     999,   '#b45309', 'award',   1.0, '[]'::jsonb, 1),
    (p_business_id, 'silver',   'Silver',   1000,  2999,  '#64748b', 'award',   1.1, '[]'::jsonb, 2),
    (p_business_id, 'gold',     'Gold',     3000,  9999,  '#ca8a04', 'crown',   1.25, '[]'::jsonb, 3),
    (p_business_id, 'platinum', 'Platinum', 10000, null,  '#7c3aed', 'gem',     1.5, '[]'::jsonb, 4)
  on conflict (business_id, slug) do nothing;
end $$;

revoke execute on function ensure_default_membership_tiers(uuid)
  from public, anon, authenticated;

-- ── recompute_customer_tier ──────────────────────────────────
create or replace function recompute_customer_tier(
  p_business_id uuid,
  p_customer_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lifetime      int := 0;
  v_tier_id       uuid;
  v_tier_slug     text;
  v_prev_tier_id  uuid;
  v_prev_slug     text;
begin
  perform ensure_default_membership_tiers(p_business_id);

  select coalesce(lifetime_points, 0)
    into v_lifetime
    from customer_wallet
   where customer_id = p_customer_id and business_id = p_business_id;

  select t.id, t.slug
    into v_tier_id, v_tier_slug
    from membership_tiers t
   where t.business_id = p_business_id
     and v_lifetime >= t.min_points
     and (t.max_points is null or v_lifetime <= t.max_points)
   order by t.min_points desc
   limit 1;

  if v_tier_id is null then
    select id, slug into v_tier_id, v_tier_slug
      from membership_tiers
     where business_id = p_business_id and slug = 'bronze'
     limit 1;
  end if;

  select cm.tier_id, mt.slug
    into v_prev_tier_id, v_prev_slug
    from customer_memberships cm
    join membership_tiers mt on mt.id = cm.tier_id
   where cm.customer_id = p_customer_id and cm.business_id = p_business_id;

  insert into customer_memberships (
    customer_id, business_id, tier_id, lifetime_points, achieved_at, updated_at
  ) values (
    p_customer_id, p_business_id, v_tier_id, v_lifetime, now(), now()
  )
  on conflict (customer_id) do update set
    tier_id         = excluded.tier_id,
    lifetime_points = excluded.lifetime_points,
    achieved_at     = case
                        when customer_memberships.tier_id is distinct from excluded.tier_id
                        then now()
                        else customer_memberships.achieved_at
                      end,
    updated_at      = now();

  if v_prev_tier_id is not null
     and v_prev_tier_id is distinct from v_tier_id
     and v_tier_slug is not null then
    perform record_event(
      p_business_id, 'loyalty.tier.upgraded', 'loyalty', p_customer_id, null, 'loyalty',
      jsonb_build_object(
        'from_tier', v_prev_slug,
        'to_tier', v_tier_slug,
        'lifetime_points', v_lifetime
      ),
      'loyalty:tier:' || p_customer_id::text || ':' || v_tier_slug,
      now()
    );
  elsif v_prev_tier_id is null and v_tier_slug is not null then
    perform record_event(
      p_business_id, 'loyalty.tier.assigned', 'loyalty', p_customer_id, null, 'loyalty',
      jsonb_build_object('tier', v_tier_slug, 'lifetime_points', v_lifetime),
      null,
      now()
    );
  end if;

  return v_tier_id;
end $$;

revoke execute on function recompute_customer_tier(uuid, uuid)
  from public, anon, authenticated;

-- ── record_points_transaction — tier recompute on earn ───────
create or replace function record_points_transaction(
  p_business_id uuid,
  p_customer_id uuid,
  p_txn_type    text,
  p_source      text,
  p_delta       int,
  p_dedup_key   text default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_campaign_id uuid default null,
  p_order_id    uuid default null,
  p_play_id     uuid default null,
  p_note        text default null,
  p_created_by  text default 'system'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id            uuid;
  v_key           text := nullif(trim(coalesce(p_dedup_key, '')), '');
  v_existing      uuid;
  v_available     int := 0;
  v_lifetime      int := 0;
  v_redeemed      int := 0;
  v_balance_after int;
  v_event_name    text;
  v_lifetime_delta int := 0;
begin
  if p_delta = 0 then return null; end if;

  if not exists (
    select 1 from customers
     where id = p_customer_id and business_id = p_business_id and deleted_at is null
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  perform ensure_default_points_rules(p_business_id);

  if v_key is not null then
    select id into v_existing
      from points_transactions
     where business_id = p_business_id and dedup_key = v_key limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  select available_points, lifetime_points, redeemed_points
    into v_available, v_lifetime, v_redeemed
    from customer_wallet
   where customer_id = p_customer_id and business_id = p_business_id
   for update;

  if not found then
    v_available := 0; v_lifetime := 0; v_redeemed := 0;
  end if;

  v_balance_after := v_available + p_delta;
  if v_balance_after < 0 then
    raise exception 'insufficient points: available %, delta %', v_available, p_delta;
  end if;

  v_lifetime_delta := case
    when p_txn_type = 'earn' and p_delta > 0 then p_delta
    when p_txn_type = 'adjust' and p_delta > 0 then p_delta
    else 0
  end;

  insert into points_transactions (
    business_id, customer_id, txn_type, source, delta, balance_after,
    campaign_id, order_id, play_id, note, dedup_key, metadata, created_by
  ) values (
    p_business_id, p_customer_id, p_txn_type, p_source, p_delta, v_balance_after,
    p_campaign_id, p_order_id, p_play_id, p_note, v_key,
    coalesce(p_metadata, '{}'::jsonb), coalesce(nullif(trim(p_created_by), ''), 'system')
  ) returning id into v_id;

  insert into customer_wallet (
    customer_id, business_id, available_points, lifetime_points, redeemed_points, updated_at
  ) values (
    p_customer_id, p_business_id, v_balance_after,
    v_lifetime + v_lifetime_delta,
    v_redeemed + case when p_txn_type in ('redeem', 'expire') then abs(p_delta) else 0 end,
    now()
  )
  on conflict (customer_id) do update set
    available_points = excluded.available_points,
    lifetime_points  = customer_wallet.lifetime_points + v_lifetime_delta,
    redeemed_points  = customer_wallet.redeemed_points
                         + case when p_txn_type in ('redeem', 'expire') then abs(p_delta) else 0 end,
    updated_at       = now();

  if v_lifetime_delta > 0 or p_txn_type = 'adjust' then
    perform recompute_customer_tier(p_business_id, p_customer_id);
  end if;

  v_event_name := case p_txn_type
    when 'earn'   then 'loyalty.points.earned'
    when 'redeem' then 'loyalty.points.redeemed'
    when 'expire' then 'loyalty.points.expired'
    else 'loyalty.points.adjusted'
  end;

  perform record_event(
    p_business_id, v_event_name, 'loyalty', p_customer_id, p_campaign_id, p_source,
    jsonb_build_object(
      'transaction_id', v_id, 'txn_type', p_txn_type, 'source', p_source,
      'delta', p_delta, 'balance_after', v_balance_after,
      'order_id', p_order_id, 'play_id', p_play_id, 'note', p_note
    ) || coalesce(p_metadata, '{}'::jsonb),
    case when v_key is not null then 'event:' || v_key else null end,
    now()
  );

  return v_id;
end $$;

-- ── get_customer_wallet — include membership tier ───────────
create or replace function get_customer_wallet(
  p_business_id uuid,
  p_customer_id uuid
) returns table (
  customer_id      uuid,
  full_name        text,
  phone            text,
  available_points int,
  lifetime_points  int,
  redeemed_points  int,
  expiring_soon    int,
  tier_slug        text,
  tier_name        text,
  bonus_multiplier numeric,
  updated_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    coalesce(c.full_name, c.name),
    c.phone,
    coalesce(w.available_points, 0),
    coalesce(w.lifetime_points, 0),
    coalesce(w.redeemed_points, 0),
    coalesce(w.expiring_soon, 0),
    coalesce(mt.slug, 'bronze'),
    coalesce(mt.name, 'Bronze'),
    coalesce(mt.bonus_multiplier, 1),
    w.updated_at
  from customers c
  left join customer_wallet w
    on w.customer_id = c.id and w.business_id = p_business_id
  left join customer_memberships cm
    on cm.customer_id = c.id and cm.business_id = p_business_id
  left join membership_tiers mt
    on mt.id = cm.tier_id and mt.business_id = p_business_id
  where c.id = p_customer_id
    and c.business_id = p_business_id
    and c.deleted_at is null;
$$;

-- ── loyalty_leaderboard — membership tier slug ───────────────
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
  tier_slug       text,
  total_orders    int,
  total_spend     numeric,
  avg_order_value numeric,
  lifetime_points int,
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
    coalesce(mt.slug, 'bronze'),
    a.total_orders,
    a.total_spend,
    a.avg_order_value,
    coalesce(w.lifetime_points, 0),
    a.last_order_at,
    a.rfm_score,
    a.health_score,
    a.clv
  from customer_analytics a
  join customers c on c.id = a.customer_id
  left join customer_wallet w on w.customer_id = c.id and w.business_id = p_business_id
  left join customer_memberships cm on cm.customer_id = c.id and cm.business_id = p_business_id
  left join membership_tiers mt on mt.id = cm.tier_id and mt.business_id = p_business_id
  where a.business_id = p_business_id
    and c.business_id = p_business_id
    and c.deleted_at is null
    and a.total_spend > 0
  order by a.total_spend desc, a.last_order_at desc nulls last
  limit greatest(1, least(p_limit, 50))
  offset greatest(0, p_offset);
$$;

-- ── loyalty_overview — points-based tier distribution ────────
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
  platinum_count         bigint,
  repeat_purchase_rate   numeric,
  loyalty_revenue        numeric,
  paying_customers       bigint,
  avg_customer_spend     numeric,
  top_customer_spend     numeric
)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      a.total_orders, a.total_spend, a.total_wins, a.total_redemptions,
      a.recency_days, a.last_order_at
    from customer_analytics a
    join customers c on c.id = a.customer_id
    where a.business_id = p_business_id
      and c.business_id = p_business_id
      and c.deleted_at is null
      and (a.total_spend > 0 or a.total_plays > 0 or a.total_redemptions > 0 or a.last_seen_at is not null)
  ),
  agg as (
    select
      count(*)::bigint as members,
      count(*) filter (
        where coalesce(recency_days, 9999) <= 90 or last_order_at >= now() - interval '90 days'
      )::bigint as active,
      coalesce(sum(total_redemptions), 0)::bigint as redemptions,
      coalesce(sum(total_wins), 0)::bigint as wins,
      count(*) filter (where total_orders >= 2)::bigint as repeat_buyers,
      count(*) filter (where total_spend > 0)::bigint as paying,
      coalesce(sum(total_spend), 0)::numeric as revenue,
      coalesce(max(total_spend), 0)::numeric as top_spend
    from base
  ),
  pts as (
    select
      coalesce(sum(delta) filter (where txn_type in ('earn', 'adjust') and delta > 0), 0)::numeric as issued,
      coalesce(sum(abs(delta)) filter (where txn_type in ('redeem', 'expire')), 0)::numeric as redeemed
    from points_transactions where business_id = p_business_id
  ),
  tiers as (
    select
      count(*) filter (where mt.slug = 'bronze')::bigint as bronze,
      count(*) filter (where mt.slug = 'silver')::bigint as silver,
      count(*) filter (where mt.slug = 'gold')::bigint as gold,
      count(*) filter (where mt.slug = 'platinum')::bigint as platinum
    from customer_memberships cm
    join membership_tiers mt on mt.id = cm.tier_id
    where cm.business_id = p_business_id
  )
  select
    members, active, pts.issued, pts.redeemed,
    case when wins > 0 then round((redemptions::numeric / wins::numeric) * 100, 1) else 0 end,
    tiers.gold, tiers.silver, tiers.bronze, tiers.platinum,
    case when paying > 0 then round((repeat_buyers::numeric / paying::numeric) * 100, 1) else 0 end,
    revenue, paying,
    case when paying > 0 then round(revenue / paying, 2) else 0 end,
    top_spend
  from agg, pts, tiers;
$$;

-- ── merchant_list_points_rules ─────────────────────────────
create or replace function merchant_list_points_rules(p_business_id uuid)
returns setof points_rules
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_default_points_rules(p_business_id);
  return query
    select * from points_rules
     where business_id = p_business_id
     order by rule_type;
end $$;

revoke execute on function merchant_list_points_rules(uuid)
  from public, anon, authenticated;

-- ── merchant_update_points_rules ─────────────────────────────
create or replace function merchant_update_points_rules(
  p_business_id uuid,
  p_rules       jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rule jsonb;
begin
  perform ensure_default_points_rules(p_business_id);

  for v_rule in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    update points_rules set
      points_per_unit = case
        when v_rule ? 'pointsPerUnit' then (v_rule->>'pointsPerUnit')::numeric
        else points_per_unit end,
      fixed_points = case
        when v_rule ? 'fixedPoints' then (v_rule->>'fixedPoints')::int
        else fixed_points end,
      multiplier = coalesce((v_rule->>'multiplier')::numeric, multiplier),
      active = coalesce((v_rule->>'active')::boolean, active)
    where business_id = p_business_id
      and rule_type = v_rule->>'ruleType';
  end loop;
end $$;

revoke execute on function merchant_update_points_rules(uuid, jsonb)
  from public, anon, authenticated;

-- ── merchant_list_membership_tiers ───────────────────────────
create or replace function merchant_list_membership_tiers(p_business_id uuid)
returns setof membership_tiers
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_default_membership_tiers(p_business_id);
  return query
    select * from membership_tiers
     where business_id = p_business_id
     order by sort_order;
end $$;

revoke execute on function merchant_list_membership_tiers(uuid)
  from public, anon, authenticated;

-- ── merchant_update_membership_tiers ─────────────────────────
create or replace function merchant_update_membership_tiers(
  p_business_id uuid,
  p_tiers       jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tier jsonb;
begin
  perform ensure_default_membership_tiers(p_business_id);

  for v_tier in select * from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb))
  loop
    update membership_tiers set
      name = coalesce(v_tier->>'name', name),
      min_points = coalesce((v_tier->>'minPoints')::int, min_points),
      max_points = case
        when v_tier ? 'maxPoints' and v_tier->>'maxPoints' = 'null' then null
        when v_tier ? 'maxPoints' then (v_tier->>'maxPoints')::int
        else max_points end,
      color = coalesce(v_tier->>'color', color),
      icon = coalesce(v_tier->>'icon', icon),
      bonus_multiplier = coalesce((v_tier->>'bonusMultiplier')::numeric, bonus_multiplier),
      benefits = coalesce(v_tier->'benefits', benefits)
    where business_id = p_business_id
      and slug = v_tier->>'slug';
  end loop;
end $$;

revoke execute on function merchant_update_membership_tiers(uuid, jsonb)
  from public, anon, authenticated;

-- ── recompute_business_customer_tiers — backfill ─────────────
create or replace function recompute_business_customer_tiers(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_customer uuid;
begin
  perform ensure_default_membership_tiers(p_business_id);
  for v_customer in
    select id from customers where business_id = p_business_id and deleted_at is null
  loop
    perform recompute_customer_tier(p_business_id, v_customer);
  end loop;
end $$;

revoke execute on function recompute_business_customer_tiers(uuid)
  from public, anon, authenticated;

-- Seed tiers for existing businesses.
select ensure_default_membership_tiers(id) from businesses;

-- Backfill memberships from existing wallet lifetime points.
do $$
declare v_biz uuid;
begin
  for v_biz in select id from businesses loop
    perform recompute_business_customer_tiers(v_biz);
  end loop;
end $$;
