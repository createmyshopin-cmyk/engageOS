-- =============================================================
-- 0039_events_read.sql — read models for the universal event stream
--
-- 0035 shipped the events table + record_event writer + the unified customer
-- timeline. The Enterprise API also needs a tenant-wide, filterable, keyset-
-- paginated event feed (the /api/v1/events list). Adding it as its own
-- migration keeps 0035 untouched (it may already be applied).
--
-- Additive only; RLS unaffected; execute revoked like every other RPC.
-- =============================================================

-- Tenant-wide event feed with keyset pagination and optional filters.
-- Keyset: pass the last row's (occurred_at, id) as (p_before_ts, p_before_id)
-- to fetch the next (older) page. Nulls start from the newest event.
create or replace function events_feed(
  p_business_id  uuid,
  p_limit        int          default 25,
  p_before_ts    timestamptz  default null,
  p_before_id    uuid         default null,
  p_category     text         default null,
  p_name         text         default null,
  p_customer_id  uuid         default null
)
returns table (
  id          uuid,
  event_name  text,
  category    text,
  source      text,
  customer_id uuid,
  campaign_id uuid,
  order_id    uuid,
  payload     jsonb,
  occurred_at timestamptz,
  created_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.event_name, e.category, e.source, e.customer_id,
         e.campaign_id, e.order_id, e.payload, e.occurred_at, e.created_at
  from events e
  where e.business_id = p_business_id
    and (p_category    is null or e.category    = p_category)
    and (p_name        is null or e.event_name  = p_name)
    and (p_customer_id is null or e.customer_id = p_customer_id)
    and (
      p_before_ts is null
      or e.occurred_at < p_before_ts
      or (e.occurred_at = p_before_ts and e.id < p_before_id)
    )
  order by e.occurred_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke execute on function events_feed(uuid, int, timestamptz, uuid, text, text, uuid)
  from public, anon, authenticated;
