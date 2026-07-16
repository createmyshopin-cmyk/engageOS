-- =============================================================
-- EngageOS Release V1 — Migration 0011: Immutable Customer Events
-- The append-only event log that powers the customer timeline,
-- the campaign funnel, live winners, and event-sourced analytics.
--
-- Immutability is enforced at the DATABASE layer: BEFORE UPDATE
-- and BEFORE DELETE triggers raise an exception, so events cannot
-- be altered or removed even by the service role. This makes the
-- log a trustworthy source of truth for reporting and fraud review.
-- =============================================================

-- ---------- Event log ----------
create table if not exists customer_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  event_type text not null check (event_type in (
    'qr_scan',          -- QR opened (funnel entry; may have no customer yet)
    'registration',     -- customer submitted name + phone
    'scratch',          -- customer revealed the card / played the game
    'prize_won',        -- weighted draw awarded a prize
    'prize_lost',       -- play resolved with no prize
    'coupon_issued',    -- a redeemable coupon was created
    'coupon_redeemed',  -- staff redeemed the coupon in-store
    'return_visit'      -- an existing customer came back (re-play / re-redeem)
  )),
  prize_id uuid references prizes(id) on delete set null,
  coupon_id uuid references coupons(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Funnel / timeline / winners read paths.
create index if not exists customer_events_campaign_type_idx
  on customer_events (campaign_id, event_type, created_at desc);
create index if not exists customer_events_business_type_idx
  on customer_events (business_id, event_type, created_at desc);
create index if not exists customer_events_customer_idx
  on customer_events (customer_id, created_at desc);

-- ---------- Immutability guard (append-only) ----------
create or replace function customer_events_immutable()
returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'customer_events is append-only: % is not permitted', tg_op;
end $$;

drop trigger if exists customer_events_no_update on customer_events;
create trigger customer_events_no_update
  before update on customer_events
  for each row execute function customer_events_immutable();

drop trigger if exists customer_events_no_delete on customer_events;
create trigger customer_events_no_delete
  before delete on customer_events
  for each row execute function customer_events_immutable();

-- ---------- Lockdown: default-deny, service-role only ----------
alter table customer_events enable row level security;
revoke all on customer_events from anon, authenticated;

-- ---------- Append helper (service-role only) ----------
-- Records one immutable event. Kept SECURITY DEFINER so the play and
-- redeem engines can emit events inline; execute is revoked from the
-- public API surface.
create or replace function record_customer_event(
  p_business_id uuid,
  p_campaign_id uuid,
  p_customer_id uuid,
  p_event_type text,
  p_prize_id uuid default null,
  p_coupon_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into customer_events (
    business_id, campaign_id, customer_id, event_type,
    prize_id, coupon_id, metadata
  ) values (
    p_business_id, p_campaign_id, p_customer_id, p_event_type,
    p_prize_id, p_coupon_id, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;

revoke execute on function record_customer_event(uuid, uuid, uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
