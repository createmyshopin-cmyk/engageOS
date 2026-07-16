-- =============================================================
-- EngageOS — Migration 0008: Tenant Audit Log
--
-- Append-only record of every tenant-scoped mutation performed
-- through the merchant portal (campaign create/update/status/
-- duplicate/delete, coupon-retry, etc). Written at the application
-- layer by the TenantRepository callers via record_audit_event().
--
-- Purpose: forensic trail + defense-in-depth. Every row carries the
-- acting business_id and merchant_id resolved from the authenticated
-- session, so a mutation can always be attributed to a tenant + user.
--
-- Access model matches the rest of the schema: service-role only.
-- anon/authenticated get NO grants (belt-and-braces revoke), and RLS
-- is default-deny with zero policies. Reads/writes happen exclusively
-- through the service role in server code.
-- =============================================================

create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  merchant_id  uuid references merchants(id) on delete set null,
  action       text not null,          -- e.g. 'campaign.create'
  entity       text not null,          -- e.g. 'campaign'
  entity_id    uuid,                    -- affected row id, when known
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_business_idx on audit_log (business_id, created_at desc);
create index audit_log_entity_idx   on audit_log (entity, entity_id);

-- Default-deny, service-role only (mirrors 0004 lockdown).
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;

-- =============================================================
-- record_audit_event — SECURITY DEFINER writer.
-- Called from server code (service role). Kept as a function so the
-- append-only contract lives in the database, not scattered inserts.
-- =============================================================
create or replace function record_audit_event(
  p_business_id uuid,
  p_merchant_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_metadata jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (business_id, merchant_id, action, entity, entity_id, metadata)
  values (p_business_id, p_merchant_id, p_action, p_entity, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb));
$$;

revoke execute on function record_audit_event(uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
