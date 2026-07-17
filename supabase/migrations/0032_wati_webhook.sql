-- =============================================================
-- EngageOS — Migration 0032: WATI Inbound Webhook Layer
--
-- Additive ONLY. This migration adds the plumbing the inbound WATI
-- webhook (POST /api/webhooks/wati) needs and touches nothing the
-- outbound flow (sync.ts), reward engine, or analytics engine already
-- depends on:
--
--   1. wati_integrations.webhook_token — a per-tenant, high-entropy
--      opaque bearer token. WATI has NO native HMAC signatures, so the
--      endpoint is secured by this secret carried in the callback URL
--      (?token=…). It is UNIQUE, giving O(1) tenant resolution — one
--      webhook can only ever resolve to exactly one business.
--
--   2. wati_webhook_deliveries — the idempotency ledger. WATI retries a
--      failed delivery up to 144 times over 24h, so every event is
--      claimed here first via UNIQUE(business_id, dedup_key). A second
--      delivery of the same event loses the insert race and is ignored.
--
--   3. coupons delivery-receipt columns + a WIDENED wa_status check.
--      The widening is purely additive — every previously-legal value
--      ('pending','sent','failed') is still legal; we only ADD the
--      'delivered'/'read' rungs the receipts populate. Existing reads
--      (migration 0009 filters, the pending partial index) are
--      unaffected.
--
--   4. campaign_events.event_type gains 'whatsapp.received' so inbound
--      customer replies can be logged in the same immutable lifecycle
--      table the outbound flow already writes to.
--
-- Lockdown matches the rest of the schema (0004/0016/0030): RLS
-- default-deny, all grants revoked from anon/authenticated.
-- =============================================================

-- ---------- 1. Per-tenant webhook bearer token ----------
alter table wati_integrations
  add column if not exists webhook_token text;

-- Backfill any existing rows and enforce presence going forward. The
-- token is 64 hex chars of entropy from two UUIDs (gen_random_uuid is
-- already the pk default on this schema, so no extension is required).
update wati_integrations
   set webhook_token = replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '')
 where webhook_token is null;

alter table wati_integrations
  alter column webhook_token set default (
    replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '')
  );

alter table wati_integrations
  alter column webhook_token set not null;

create unique index if not exists wati_integrations_webhook_token_idx
  on wati_integrations (webhook_token);

-- ---------- 2. Idempotency ledger ----------
create table if not exists wati_webhook_deliveries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- dedup_key = eventType : (whatsappMessageId | localMessageId) : statusString
  -- Same event re-delivered by WATI collapses onto the same key.
  dedup_key   text not null,
  event_type  text not null,
  created_at  timestamptz not null default now(),
  unique (business_id, dedup_key)
);

-- Retention sweeps (events older than the 24h retry window are dead weight).
create index if not exists wati_webhook_deliveries_created_idx
  on wati_webhook_deliveries (created_at);

alter table wati_webhook_deliveries enable row level security;
revoke all on wati_webhook_deliveries from anon, authenticated;

-- ---------- 3. Coupon delivery receipts ----------
alter table coupons
  add column if not exists wa_sent_at      timestamptz,
  add column if not exists wa_delivered_at timestamptz,
  add column if not exists wa_read_at      timestamptz,
  add column if not exists wa_failed_at    timestamptz,
  add column if not exists wa_failed_reason text;

-- Widen wa_status to carry the delivery-receipt rungs. Additive: the
-- prior three values remain valid, so nothing that writes them breaks.
alter table coupons
  drop constraint if exists coupons_wa_status_check;
alter table coupons
  add constraint coupons_wa_status_check
  check (wa_status in ('pending','sent','delivered','read','failed'));

-- ---------- 4. Inbound reply lifecycle event ----------
-- Rebuild the campaign_events.event_type check to add 'whatsapp.received'.
-- The list is reproduced verbatim from migration 0016 plus the one addition
-- so no existing event type is lost.
alter table campaign_events
  drop constraint if exists campaign_events_event_type_check;
alter table campaign_events
  add constraint campaign_events_event_type_check
  check (event_type in (
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
    'qr.generated',
    'qr.downloaded',
    'poster.printed',
    'customer.scan',
    'customer.registered',
    'scratch.started',
    'scratch.completed',
    'prize.allocated',
    'prize.exhausted',
    'coupon.generated',
    'coupon.redeemed',
    'gift.claimed',
    'whatsapp.queue',
    'whatsapp.sent',
    'whatsapp.delivered',
    'whatsapp.read',
    'whatsapp.failed',
    'whatsapp.received',
    'csv.export',
    'customer.export',
    'merchant.login',
    'settings.updated',
    'analytics.viewed',
    'reward.viewed',
    'reward.disabled',
    'reward.enabled',
    'source.created',
    'redirect.opened',
    'redirect.started',
    'redirect.completed',
    'redirect.enabled',
    'qr.printed'
  ));
