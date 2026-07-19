-- =============================================================
-- EngageOS — Migration 0085: Communication Gateway (WACRM bridge)
--
-- Restores the EngageOS ↔ wacrm integration tables dropped in 0084.
-- WATI (wati_integrations) is unchanged. One active WhatsApp provider
-- per tenant is enforced at the application layer.
-- =============================================================

create table if not exists business_integrations (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null unique references businesses(id) on delete cascade,
  provider                 text not null default 'wacrm' check (provider = 'wacrm'),
  base_url                 text not null,
  api_key_enc              text not null,
  api_key_last4            text not null,
  account_id               text not null,
  account_name             text,
  webhook_id               text,
  webhook_secret_enc       text,
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

create index if not exists business_integrations_account_idx
  on business_integrations (account_id);

create table if not exists wa_message_map (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  whatsapp_message_id   text not null unique,
  wacrm_message_id      text,
  wacrm_conversation_id text,
  campaign_id           uuid references campaigns(id) on delete set null,
  customer_id           uuid references customers(id) on delete set null,
  coupon_id             uuid references coupons(id) on delete set null,
  purpose               text not null default 'other'
                        check (purpose in ('coupon_delivery', 'inbox_reply', 'other')),
  status                text not null default 'sent'
                        check (status in ('sent', 'delivered', 'read', 'failed')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists wa_message_map_business_idx
  on wa_message_map (business_id, created_at desc);

create table if not exists whatsapp_broadcasts (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  wacrm_broadcast_id text not null,
  name               text not null,
  template_name      text not null,
  template_language  text not null default 'en',
  segment            text not null default 'all',
  total_recipients   integer not null default 0,
  accepted           integer not null default 0,
  rejected           integer not null default 0,
  status             text not null default 'sending',
  sent_count         integer not null default 0,
  delivered_count    integer not null default 0,
  read_count         integer not null default 0,
  failed_count       integer not null default 0,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists whatsapp_broadcasts_business_idx
  on whatsapp_broadcasts (business_id, created_at desc);

create table if not exists wacrm_webhook_deliveries (
  id          text primary key,
  business_id uuid references businesses(id) on delete cascade,
  event       text not null,
  received_at timestamptz not null default now()
);

alter table customers add column if not exists wacrm_contact_id text;

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

alter table business_integrations enable row level security;
alter table wa_message_map enable row level security;
alter table whatsapp_broadcasts enable row level security;
alter table wacrm_webhook_deliveries enable row level security;

revoke all on business_integrations from anon, authenticated;
revoke all on wa_message_map from anon, authenticated;
revoke all on whatsapp_broadcasts from anon, authenticated;
revoke all on wacrm_webhook_deliveries from anon, authenticated;
