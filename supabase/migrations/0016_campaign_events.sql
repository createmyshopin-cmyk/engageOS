-- =============================================================
-- EngageOS Release V1.1 — Migration 0016: Campaign Events Engine
--
-- The single, immutable, append-only source of truth for the ENTIRE
-- campaign lifecycle: merchant/admin mutations, customer funnel
-- activity, QR/print/marketing actions, WhatsApp delivery, exports,
-- and system/worker/cron activity. Powers lifecycle tracking,
-- analytics, auditing, troubleshooting, and AI insights.
--
-- This is ADDITIVE. It does not alter the existing customer_events
-- (funnel log, migration 0011) or audit_log (mutation trail, 0008).
-- Instead it unifies the campaign story in one queryable table.
--
-- Immutability is enforced at the DATABASE layer (BEFORE UPDATE /
-- BEFORE DELETE triggers raise), mirroring customer_events. Writes
-- happen exclusively through record_campaign_event() — a
-- SECURITY DEFINER function, execute revoked from the public API
-- surface — so events are only ever generated on the server.
--
-- Lockdown matches the rest of the schema (migration 0004): RLS
-- enabled default-deny, all grants revoked from anon/authenticated.
-- =============================================================

-- ---------- Event log ----------
create table if not exists campaign_events (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  -- campaign_id is nullable: a few events (e.g. merchant.login,
  -- settings.updated) are tenant-scoped but not campaign-scoped.
  campaign_id  uuid references campaigns(id) on delete set null,
  actor_type   text not null check (actor_type in (
    'platform_admin',
    'merchant_owner',
    'merchant_manager',
    'merchant_staff',
    'customer',
    'system',
    'worker',
    'cron'
  )),
  -- actor_id: merchant_id, customer_id, or null for system/cron. Free-form
  -- (no FK) so an actor row can be deleted without orphaning history.
  actor_id     uuid,
  event_type   text not null check (event_type in (
    -- Campaign lifecycle
    'campaign.created',
    'campaign.updated',
    'campaign.published',
    'campaign.activated',
    'campaign.paused',
    'campaign.resumed',
    'campaign.ended',
    'campaign.deleted',
    'campaign.duplicated',
    'campaign.viewed',
    'campaign.shared',
    'campaign.archived',
    -- Distribution / print
    'qr.generated',
    'qr.downloaded',
    'poster.printed',
    -- Customer funnel
    'customer.scan',
    'customer.registered',
    'scratch.started',
    'scratch.completed',
    'prize.allocated',
    'prize.exhausted',
    'coupon.generated',
    'coupon.redeemed',
    'gift.claimed',
    -- WhatsApp lifecycle
    'whatsapp.queue',
    'whatsapp.sent',
    'whatsapp.delivered',
    'whatsapp.read',
    'whatsapp.failed',
    -- Exports
    'csv.export',
    'customer.export',
    -- Account / settings
    'merchant.login',
    'settings.updated',
    'analytics.viewed'
  )),
  metadata     jsonb not null default '{}'::jsonb,
  ip_address   text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- ---------- Indexes (single-column) ----------
create index if not exists campaign_events_business_idx
  on campaign_events (business_id);
create index if not exists campaign_events_campaign_idx
  on campaign_events (campaign_id);
create index if not exists campaign_events_event_type_idx
  on campaign_events (event_type);
create index if not exists campaign_events_created_at_idx
  on campaign_events (created_at desc);

-- ---------- Indexes (composite, for the hot read paths) ----------
-- (business_id, campaign_id): a campaign's timeline within a tenant.
create index if not exists campaign_events_business_campaign_idx
  on campaign_events (business_id, campaign_id, created_at desc);
-- (business_id, event_type): tenant-wide counts / filters by type.
create index if not exists campaign_events_business_type_idx
  on campaign_events (business_id, event_type, created_at desc);

-- ---------- Immutability guard (append-only) ----------
-- No UPDATE. No DELETE. Enforced in the database so the log is a
-- trustworthy source of truth even against the service role.
create or replace function campaign_events_immutable()
returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'campaign_events is append-only: % is not permitted', tg_op;
end $$;

drop trigger if exists campaign_events_no_update on campaign_events;
create trigger campaign_events_no_update
  before update on campaign_events
  for each row execute function campaign_events_immutable();

drop trigger if exists campaign_events_no_delete on campaign_events;
create trigger campaign_events_no_delete
  before delete on campaign_events
  for each row execute function campaign_events_immutable();

-- ---------- Lockdown: default-deny, service-role only ----------
alter table campaign_events enable row level security;
revoke all on campaign_events from anon, authenticated;

-- ---------- Append helper (service-role only) ----------
-- The ONLY sanctioned write path. Kept SECURITY DEFINER so server
-- code (service role) can emit events inline; execute is revoked
-- from the public API surface. business_id / campaign_id / actor are
-- always supplied by the server from the authenticated context,
-- never trusted from the client.
create or replace function record_campaign_event(
  p_business_id uuid,
  p_campaign_id uuid,
  p_actor_type  text,
  p_actor_id    uuid,
  p_event_type  text,
  p_metadata    jsonb default '{}'::jsonb,
  p_ip_address  text default null,
  p_user_agent  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into campaign_events (
    business_id, campaign_id, actor_type, actor_id,
    event_type, metadata, ip_address, user_agent
  ) values (
    p_business_id, p_campaign_id, p_actor_type, p_actor_id,
    p_event_type, coalesce(p_metadata, '{}'::jsonb), p_ip_address, p_user_agent
  ) returning id into v_id;
  return v_id;
end $$;

revoke execute on function record_campaign_event(uuid, uuid, text, uuid, text, jsonb, text, text)
  from public, anon, authenticated;
