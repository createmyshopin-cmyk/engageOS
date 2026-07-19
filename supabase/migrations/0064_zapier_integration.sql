-- =============================================================
-- EngageOS — Migration 0064: Zapier integration + merchant API keys
--
-- Merchants connect Zapier via per-tenant API keys (eos_live_*).
-- Zapier REST Hook subscriptions are stored in zapier_hook_subscriptions.
-- RLS default-deny, service-role only — mirrors google_sheets_integrations.
-- =============================================================

-- ---------- Merchant API keys (programmatic access) ----------
create table if not exists merchant_api_keys (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null default 'Zapier',
  key_prefix   text not null,
  key_hash     text not null unique,
  scopes       text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists merchant_api_keys_business_id_idx
  on merchant_api_keys (business_id);

create index if not exists merchant_api_keys_key_hash_idx
  on merchant_api_keys (key_hash);

-- ---------- Zapier integration status (one row per business) ----------
create table if not exists zapier_integrations (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null unique references businesses(id) on delete cascade,
  status                text not null default 'disconnected'
                        check (status in ('connected', 'disconnected')),
  zapier_account_label  text,
  connected_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------- Zapier REST Hook subscriptions ----------
create table if not exists zapier_hook_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id) on delete cascade,
  hook_url         text not null,
  event_name       text not null,
  is_active        boolean not null default true,
  failure_count    integer not null default 0,
  last_delivery_at timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists zapier_hook_subscriptions_business_event_idx
  on zapier_hook_subscriptions (business_id, event_name)
  where is_active = true;

alter table merchant_api_keys enable row level security;
alter table zapier_integrations enable row level security;
alter table zapier_hook_subscriptions enable row level security;

revoke all on merchant_api_keys from anon, authenticated;
revoke all on zapier_integrations from anon, authenticated;
revoke all on zapier_hook_subscriptions from anon, authenticated;

-- ---------- Atomic consecutive-failure counter ----------
create or replace function public.record_zapier_hook_failure(
  p_hook_id uuid,
  p_max_failures int
)
returns void as $$
  update zapier_hook_subscriptions
  set failure_count = failure_count + 1,
      is_active = case
        when failure_count + 1 >= p_max_failures then false
        else is_active
      end
  where id = p_hook_id;
$$ language sql security definer set search_path = public;

revoke execute on function public.record_zapier_hook_failure(uuid, int)
  from public, anon, authenticated;
