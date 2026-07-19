-- =============================================================
-- EngageOS — Migration 0063: Google Sheets configurable export feeds
-- =============================================================

create table if not exists google_sheets_feeds (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  feed_type    text not null check (feed_type in (
    'all_customers', 'new_customers', 'reward_customers',
    'tag', 'campaign', 'campaigns_summary', 'shopify_codes'
  )),
  feed_key     text not null,
  tab_name     text not null,
  campaign_id  uuid references campaigns(id) on delete cascade,
  tag_id       uuid references customer_tags(id) on delete cascade,
  config       jsonb not null default '{}'::jsonb,
  enabled      boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, feed_key)
);

create index if not exists google_sheets_feeds_business_idx
  on google_sheets_feeds (business_id, sort_order);

alter table google_sheets_feeds enable row level security;
revoke all on google_sheets_feeds from anon, authenticated;

-- Customers with a specific tag
create or replace function merchant_list_customers_by_tag(
  p_business_id uuid,
  p_tag_id      uuid,
  p_limit       int,
  p_cursor_ts   timestamptz default null,
  p_cursor_id   uuid default null
) returns table (
  id                uuid,
  phone             text,
  name              text,
  email             text,
  created_at        timestamptz,
  latest_prize_name text,
  latest_code       text,
  reward_count      int,
  tags              text
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.phone,
    c.name,
    c.email,
    c.created_at,
    lat.prize_name as latest_prize_name,
    lat.code as latest_code,
    coalesce(rc.cnt, 0)::int as reward_count,
    coalesce(tg.names, '') as tags
  from customers c
  join customer_tag_map m
    on m.customer_id = c.id
   and m.business_id = p_business_id
   and m.tag_id = p_tag_id
  left join lateral (
    select co.prize_name, co.code
    from coupons co
    where co.business_id = p_business_id and co.customer_id = c.id
    order by co.created_at desc
    limit 1
  ) lat on true
  left join lateral (
    select count(*)::int as cnt
    from coupons co
    where co.business_id = p_business_id and co.customer_id = c.id
  ) rc on true
  left join lateral (
    select string_agg(distinct t.name, ', ' order by t.name) as names
    from customer_tag_map tm
    join customer_tags t on t.id = tm.tag_id and t.business_id = p_business_id
    where tm.customer_id = c.id
  ) tg on true
  where c.business_id = p_business_id
    and c.deleted_at is null
    and exists (
      select 1 from customer_tags t
      where t.id = p_tag_id and t.business_id = p_business_id
    )
    and (
      p_cursor_ts is null or p_cursor_id is null
      or (c.created_at < p_cursor_ts or (c.created_at = p_cursor_ts and c.id < p_cursor_id))
    )
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function merchant_list_customers_by_tag(uuid, uuid, int, timestamptz, uuid)
  from public, anon, authenticated;

-- Customers who played a specific campaign
create or replace function merchant_list_customers_by_campaign(
  p_business_id  uuid,
  p_campaign_id  uuid,
  p_limit        int,
  p_cursor_ts    timestamptz default null,
  p_cursor_id    uuid default null
) returns table (
  id                uuid,
  phone             text,
  name              text,
  email             text,
  created_at        timestamptz,
  campaign_name     text,
  prize_name        text,
  code              text,
  coupon_status     text,
  played_at         timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.phone,
    c.name,
    c.email,
    c.created_at,
    cm.name as campaign_name,
    co.prize_name,
    co.code,
    co.status as coupon_status,
    pl.created_at as played_at
  from plays pl
  join customers c
    on c.id = pl.customer_id
   and c.business_id = p_business_id
   and c.deleted_at is null
  join campaigns cm
    on cm.id = pl.campaign_id
   and cm.business_id = p_business_id
  left join lateral (
    select cp.prize_name, cp.code, cp.status
    from coupons cp
    where cp.business_id = p_business_id
      and cp.customer_id = c.id
      and cp.campaign_id = p_campaign_id
    order by cp.created_at desc
    limit 1
  ) co on true
  where pl.business_id = p_business_id
    and pl.campaign_id = p_campaign_id
    and (
      p_cursor_ts is null or p_cursor_id is null
      or (pl.created_at < p_cursor_ts or (pl.created_at = p_cursor_ts and c.id < p_cursor_id))
    )
  order by pl.created_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function merchant_list_customers_by_campaign(uuid, uuid, int, timestamptz, uuid)
  from public, anon, authenticated;

-- Campaign summary for export tab
create or replace function merchant_list_campaigns_for_export(
  p_business_id uuid,
  p_limit       int default 500,
  p_cursor_ts   timestamptz default null,
  p_cursor_id   uuid default null
) returns table (
  id                uuid,
  name              text,
  slug              text,
  status            text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_at        timestamptz,
  plays             bigint,
  wins              bigint,
  redeemed          bigint,
  remaining_coupons bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.slug,
    c.status,
    c.starts_at,
    c.ends_at,
    c.created_at,
    coalesce(st.plays, 0) as plays,
    coalesce(st.wins, 0) as wins,
    coalesce(st.redeemed, 0) as redeemed,
    coalesce(st.remaining_coupons, 0) as remaining_coupons
  from campaigns c
  left join campaign_stats_for_business(p_business_id) st
    on st.campaign_id = c.id
  where c.business_id = p_business_id
    and (
      p_cursor_ts is null or p_cursor_id is null
      or (c.created_at < p_cursor_ts or (c.created_at = p_cursor_ts and c.id < p_cursor_id))
    )
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function merchant_list_campaigns_for_export(uuid, int, timestamptz, uuid)
  from public, anon, authenticated;
