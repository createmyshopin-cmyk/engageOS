-- =============================================================
-- EngageOS CDP — Migration 0035: Universal Event Backbone + Timeline
--
-- Phase 1 of the CDP foundation. Introduces the go-forward UNIVERSAL
-- event stream that every future module (commerce, loyalty, marketing
-- automation, communication, AI) writes to and reads from.
--
-- This does NOT replace or modify the existing append-only logs:
--   * customer_events (0011) — the campaign funnel, 8 locked types,
--     still written by the play/scan/redeem engines. UNTOUCHED.
--   * campaign_events (0016) — merchant/system lifecycle audit.
--     UNTOUCHED.
-- The new events table is a superset stream for cross-domain activity.
-- customer_timeline_unified() merges the historic funnel log with the
-- new stream so the customer timeline shows everything.
--
-- Immutability, RLS default-deny, and the record_* writer contract all
-- match the existing event tables.
-- =============================================================

-- ---------- Universal event stream ----------
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  campaign_id  uuid references campaigns(id) on delete set null,
  order_id     uuid,                      -- FK added in the commerce phase
  event_name   text not null,             -- dotted, e.g. 'order.placed', 'points.earned'
  category     text not null check (category in (
    'commerce', 'loyalty', 'campaign', 'communication',
    'profile', 'marketing', 'system', 'ai'
  )),
  source       text not null default 'system',  -- 'shopify' | 'wati' | 'pos' | 'web' | 'app' | ...
  payload      jsonb not null default '{}'::jsonb,
  dedup_key    text,                      -- idempotent ingestion key (per business)
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Idempotent ingestion: a provider re-delivering the same event is a no-op.
create unique index if not exists events_dedup_idx
  on events (business_id, dedup_key) where dedup_key is not null;

-- Read paths: business firehose, per-customer timeline, category + name slices.
create index if not exists events_business_time_idx
  on events (business_id, occurred_at desc);
create index if not exists events_customer_time_idx
  on events (customer_id, occurred_at desc);
create index if not exists events_business_category_idx
  on events (business_id, category, occurred_at desc);
create index if not exists events_business_name_idx
  on events (business_id, event_name, occurred_at desc);
create index if not exists events_payload_gin_idx
  on events using gin (payload);

-- ---------- Immutability guard (append-only, mirrors 0011) ----------
create or replace function events_immutable()
returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'events is append-only: % is not permitted', tg_op;
end $$;

drop trigger if exists events_no_update on events;
create trigger events_no_update
  before update on events
  for each row execute function events_immutable();

drop trigger if exists events_no_delete on events;
create trigger events_no_delete
  before delete on events
  for each row execute function events_immutable();

-- ---------- Lockdown: default-deny, service-role only ----------
alter table events enable row level security;
revoke all on events from anon, authenticated;

-- ---------- Append helper (service-role only) ----------
-- Records one immutable universal event. Idempotent when p_dedup_key is
-- supplied. Returns the event id (existing id on a dedup hit, null if the
-- conflict row could not be re-read — callers treat null as "already
-- recorded"). Kept SECURITY DEFINER so any module can emit inline.
create or replace function record_event(
  p_business_id uuid,
  p_event_name  text,
  p_category    text,
  p_customer_id uuid default null,
  p_campaign_id uuid default null,
  p_source      text default 'system',
  p_payload     jsonb default '{}'::jsonb,
  p_dedup_key   text default null,
  p_occurred_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id  uuid;
  v_key text := nullif(trim(coalesce(p_dedup_key, '')), '');
begin
  insert into events (
    business_id, customer_id, campaign_id, event_name, category,
    source, payload, dedup_key, occurred_at
  ) values (
    p_business_id, p_customer_id, p_campaign_id, p_event_name, p_category,
    coalesce(nullif(trim(coalesce(p_source, '')), ''), 'system'),
    coalesce(p_payload, '{}'::jsonb), v_key, coalesce(p_occurred_at, now())
  )
  on conflict (business_id, dedup_key) where dedup_key is not null do nothing
  returning id into v_id;

  -- Dedup hit: return the existing event id for the caller's convenience.
  if v_id is null and v_key is not null then
    select id into v_id from events
     where business_id = p_business_id and dedup_key = v_key;
  end if;

  return v_id;
end $$;

revoke execute on function record_event(uuid, text, text, uuid, uuid, text, jsonb, text, timestamptz)
  from public, anon, authenticated;

-- =============================================================
-- customer_timeline_unified — merges the historic funnel log
-- (customer_events) with the new universal stream (events) into one
-- chronologically-ordered, keyset-paginated timeline for a customer.
--
-- Normalizes both sources into a common shape. Does NOT alter the
-- existing customer_timeline(uuid,uuid) RPC from 0014.
--
-- p_before enables keyset pagination: pass the oldest ts from the prior
-- page to fetch the next page. Null starts from the newest event.
-- =============================================================
create or replace function customer_timeline_unified(
  p_business_id uuid,
  p_customer_id uuid,
  p_limit       int default 50,
  p_before      timestamptz default null
)
returns table (
  id           uuid,
  ts           timestamptz,
  kind         text,        -- 'funnel' (customer_events) | 'stream' (events)
  name         text,        -- event_type or event_name
  category     text,        -- 'campaign' for funnel rows; events.category otherwise
  ref_campaign uuid,
  ref_coupon   uuid,
  payload      jsonb
)
language sql stable security definer set search_path = public as $$
  with unified as (
    -- Historic funnel events.
    select
      ce.id,
      ce.created_at as ts,
      'funnel'::text as kind,
      ce.event_type  as name,
      'campaign'::text as category,
      ce.campaign_id as ref_campaign,
      ce.coupon_id   as ref_coupon,
      ce.metadata    as payload
    from customer_events ce
    where ce.business_id = p_business_id
      and ce.customer_id = p_customer_id
    union all
    -- Universal stream.
    select
      e.id,
      e.occurred_at as ts,
      'stream'::text as kind,
      e.event_name  as name,
      e.category,
      e.campaign_id as ref_campaign,
      null::uuid    as ref_coupon,
      e.payload
    from events e
    where e.business_id = p_business_id
      and e.customer_id = p_customer_id
  )
  select id, ts, kind, name, category, ref_campaign, ref_coupon, payload
  from unified
  where p_before is null or ts < p_before
  order by ts desc, id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke execute on function customer_timeline_unified(uuid, uuid, int, timestamptz)
  from public, anon, authenticated;
