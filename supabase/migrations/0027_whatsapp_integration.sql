-- =============================================================
-- EngageOS V2.2 — Migration 0027: WhatsApp CRM (wacrm) Integration
--
-- EngageOS keeps ONLY the integration mapping; all CRM data
-- (contacts, conversations, templates, automations) lives in wacrm.
--
--   business_integrations   one wacrm account per EngageOS tenant
--   wa_message_map           wamid → campaign/customer/coupon correlation
--   whatsapp_broadcasts      launched-broadcast ledger (status is polled
--                            from wacrm; wacrm stays the source of truth)
--   wacrm_webhook_deliveries webhook idempotency guard (dedupe on id)
--
-- Secrets (API key, webhook secret) are AES-256-GCM encrypted at the
-- app layer BEFORE insert — the database never sees plaintext keys.
-- Lockdown matches the rest of the schema (0004): RLS default-deny,
-- all grants revoked from anon/authenticated; service-role only.
-- =============================================================

-- ---------- Tenant ↔ wacrm account mapping ----------
create table if not exists business_integrations (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null unique references businesses(id) on delete cascade,
  provider                 text not null default 'wacrm' check (provider = 'wacrm'),
  base_url                 text not null,
  api_key_enc              text not null,          -- AES-256-GCM, app layer
  api_key_last4            text not null,
  account_id               text not null,          -- wacrm account id (from /api/v1/me)
  account_name             text,
  webhook_id               text,                   -- wacrm outbound-webhook endpoint id
  webhook_secret_enc       text,                   -- AES-256-GCM, app layer
  coupon_template_name     text,
  coupon_template_language text not null default 'en',
  auto_send_coupons        boolean not null default false,
  status                   text not null default 'connected'
                           check (status in ('connected', 'error', 'disconnected')),
  last_error               text,
  last_verified_at         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Webhook receiver resolves the tenant from the payload's account_id.
create index if not exists business_integrations_account_idx
  on business_integrations (account_id);

-- ---------- Outbound message correlation (wamid → EngageOS entities) ----------
-- Lets delivery-status webhooks land back on the right campaign/coupon.
create table if not exists wa_message_map (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references businesses(id) on delete cascade,
  whatsapp_message_id  text not null unique,       -- wamid.… from wacrm
  wacrm_message_id     text,
  wacrm_conversation_id text,
  campaign_id          uuid references campaigns(id) on delete set null,
  customer_id          uuid references customers(id) on delete set null,
  coupon_id            uuid references coupons(id) on delete set null,
  purpose              text not null default 'other'
                       check (purpose in ('coupon_delivery', 'inbox_reply', 'other')),
  status               text not null default 'sent'
                       check (status in ('sent', 'delivered', 'read', 'failed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists wa_message_map_business_idx
  on wa_message_map (business_id, created_at desc);

-- ---------- Launched broadcast ledger ----------
-- The public wacrm API has no "list broadcasts", so EngageOS keeps a
-- ledger of the broadcasts IT launched and polls wacrm for live counts.
create table if not exists whatsapp_broadcasts (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id) on delete cascade,
  wacrm_broadcast_id  text not null,
  name                text not null,
  template_name       text not null,
  template_language   text not null default 'en',
  segment             text not null default 'all',
  total_recipients    integer not null default 0,
  accepted            integer not null default 0,
  rejected            integer not null default 0,
  status              text not null default 'sending',
  sent_count          integer not null default 0,
  delivered_count     integer not null default 0,
  read_count          integer not null default 0,
  failed_count        integer not null default 0,
  created_by          uuid,                        -- merchant_id (no FK: history survives)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists whatsapp_broadcasts_business_idx
  on whatsapp_broadcasts (business_id, created_at desc);

-- ---------- Webhook idempotency (providers re-send + re-order) ----------
create table if not exists wacrm_webhook_deliveries (
  id           text primary key,                   -- per-delivery uuid from wacrm
  business_id  uuid references businesses(id) on delete cascade,
  event        text not null,
  received_at  timestamptz not null default now()
);

-- ---------- Contact mapping + opt-out on customers ----------
-- "Store only the mapping" — the contact itself lives in wacrm.
alter table customers add column if not exists wacrm_contact_id text;
alter table customers add column if not exists wa_opt_out boolean not null default false;

-- ---------- Atomic quota counter ----------
-- supabase-js cannot express `col = col + n`; this keeps the per-tenant
-- COGS counter race-free. Service-role only, like every other RPC.
create or replace function increment_wa_sent(
  p_business_id uuid,
  p_count       integer default 1
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update businesses
     set wa_messages_sent = wa_messages_sent + greatest(p_count, 0)
   where id = p_business_id;
end $$;

revoke execute on function increment_wa_sent(uuid, integer)
  from public, anon, authenticated;

-- ---------- Lockdown: default-deny, service-role only ----------
alter table business_integrations enable row level security;
alter table wa_message_map enable row level security;
alter table whatsapp_broadcasts enable row level security;
alter table wacrm_webhook_deliveries enable row level security;

revoke all on business_integrations from anon, authenticated;
revoke all on wa_message_map from anon, authenticated;
revoke all on whatsapp_broadcasts from anon, authenticated;
revoke all on wacrm_webhook_deliveries from anon, authenticated;
