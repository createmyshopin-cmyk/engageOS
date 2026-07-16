-- =============================================================
-- EngageOS — Migration 0006: Merchant Authentication
-- Creates merchants table (portal logins) and merchant_sessions.
-- Password hashing (Argon2id) happens at the application layer.
-- All access goes through service-role only — anon/authenticated
-- have NO grants on these tables.
-- =============================================================

-- ---------- Merchants (portal login accounts) ----------
create table merchants (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  email         text not null,
  phone         text,
  password_hash text not null,
  role          text not null default 'owner'
                  check (role in ('owner', 'manager', 'staff')),
  status        text not null default 'active'
                  check (status in ('active', 'suspended')),
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (email)
);

create index merchants_business_idx  on merchants (business_id);
create index merchants_email_idx     on merchants (email);

-- updated_at trigger
create or replace function merchants_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger merchants_updated_at
  before update on merchants
  for each row execute function merchants_set_updated_at();

-- ---------- Merchant sessions ----------
create table merchant_sessions (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  session_token text not null unique,          -- 64-char hex, HMAC-signed at app layer
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index merchant_sessions_token_idx      on merchant_sessions (session_token);
create index merchant_sessions_merchant_idx   on merchant_sessions (merchant_id);
create index merchant_sessions_expires_idx    on merchant_sessions (expires_at);

-- ---------- Security ----------
-- Revoke all grants from anon/authenticated on new tables
revoke all on merchants, merchant_sessions from anon, authenticated;

-- ---------- Cleanup job helper: delete expired sessions ----------
-- Called by application layer on login (lazy cleanup — no cron needed).
create or replace function purge_expired_merchant_sessions()
returns void language sql security definer as $$
  delete from merchant_sessions where expires_at < now();
$$;

-- ---------- Rate-limit helper for merchant login ----------
-- Reuses the existing check_rate_limit function (already exists).
-- p_key pattern: 'mlogin:<ip>'
-- p_max: 10 attempts per hour
