-- =============================================================
-- EngageOS MVP — Migration 0003
-- Notification foundation: channel-agnostic outbox. MVP writes
-- rows and delivers via WhatsApp (Feature 6 cron); future channels
-- (push/email/in-app) read the same table — no redesign needed.
-- =============================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null check (type in (
    'daily_report', 'customer_milestone', 'prize_low',
    'campaign_ending', 'whatsapp_failure', 'high_traffic'
  )),
  title text not null,
  body text not null,
  -- delivery per channel; add columns/channels without redesign
  wa_status text not null default 'pending' check (wa_status in ('pending','sent','failed','skipped')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_business_idx on notifications (business_id, created_at desc);
create index notifications_wa_pending_idx on notifications (wa_status) where wa_status = 'pending';

alter table notifications enable row level security;
-- service-role only in MVP; merchant-facing read policies come with merchant auth (Phase 2)
