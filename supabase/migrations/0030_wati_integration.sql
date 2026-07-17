-- =============================================================
-- EngageOS — Migration 0030: WATI WhatsApp Integration (API v3)
--
-- WATI is a second, independent WhatsApp gateway option alongside the
-- Meta Cloud API (wacrm) integration from 0027. It gets its OWN table
-- rather than sharing business_integrations, because that table is
-- locked to `provider = 'wacrm'` and UNIQUE(business_id) — a merchant
-- may connect wacrm and WATI at the same time, and the core wacrm flow
-- must stay untouched.
--
-- EngageOS keeps ONLY the connection + coupon-delivery config; all
-- messaging happens on WATI. The API token is AES-256-GCM encrypted at
-- the app layer (same WACRM_ENCRYPTION_KEY) BEFORE insert — the
-- database never sees a plaintext token. Lockdown matches 0027/0004:
-- RLS default-deny, all grants revoked from anon/authenticated;
-- service-role only.
-- =============================================================

create table if not exists wati_integrations (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null unique references businesses(id) on delete cascade,
  provider                 text not null default 'wati' check (provider = 'wati'),
  base_url                 text not null,          -- tenant host, e.g. https://live-mt-server.wati.io/{tenantId}
  api_token_enc            text not null,          -- AES-256-GCM, app layer
  api_token_last4          text not null,
  channel_id               text,                   -- WATI channel id (from GET /channels)
  channel_name             text,                   -- custom channel name
  display_name             text,                   -- merchant-facing label
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

-- ---------- Lockdown: default-deny, service-role only ----------
alter table wati_integrations enable row level security;
revoke all on wati_integrations from anon, authenticated;
