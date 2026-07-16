-- =============================================================
-- EngageOS — Migration 0005
-- Adds public_id (26-char random uppercase alphanumeric) to businesses
-- for human-readable merchant dashboard URLs: /m/[slug]_[public_id]
-- Never exposes the internal UUID primary key.
-- =============================================================

-- Helper: generate a 26-char random ID using hex (uppercase)
-- We use the first 26 chars of an uppercase hex-encoded random 16 bytes
create or replace function gen_public_id()
returns text
language sql
as $$
  select upper(substr(encode(gen_random_bytes(13), 'hex'), 1, 26))
$$;

-- Add public_id column (nullable first so backfill can run)
alter table businesses
  add column if not exists public_id text unique;

-- Backfill any existing rows
update businesses
  set public_id = gen_public_id()
  where public_id is null;

-- Now enforce NOT NULL
alter table businesses
  alter column public_id set not null;

-- Add check constraint (26 hex chars, uppercase)
alter table businesses
  add constraint businesses_public_id_format
  check (public_id ~ '^[0-9A-F]{26}$');

-- Set DEFAULT for future inserts
alter table businesses
  alter column public_id set default gen_public_id();

-- Index for fast lookup
create index if not exists businesses_public_id_idx on businesses (public_id);

-- =============================================================
-- New RPC: look up merchant by public_id (used by /m/[slug]_[id])
-- =============================================================

create or replace function merchant_report_by_public_id(p_public_id text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business_id',       b.id,
    'business_name',     b.name,
    'slug',              b.slug,
    'public_id',         b.public_id,
    'city',              b.city,
    'wa_messages_sent',  b.wa_messages_sent,
    'wa_messages_quota', b.wa_messages_quota,
    'totals', (
      select jsonb_build_object(
        'customers', (select count(*) from customers c where c.business_id = b.id),
        'plays',     (select count(*) from plays p where p.business_id = b.id),
        'wins',      (select count(*) from plays p where p.business_id = b.id and p.won),
        'redeemed',  (select count(*) from coupons cp where cp.business_id = b.id and cp.status = 'redeemed')
      )
    ),
    'campaigns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',        c.id,
        'name',      c.name,
        'slug',      c.slug,
        'status',    c.status,
        'starts_at', c.starts_at,
        'ends_at',   c.ends_at,
        'plays',    (select count(*) from plays p where p.campaign_id = c.id),
        'wins',     (select count(*) from plays p where p.campaign_id = c.id and p.won),
        'redeemed', (select count(*) from coupons cp where cp.campaign_id = c.id and cp.status = 'redeemed')
      ) order by c.created_at desc), '[]'::jsonb)
      from campaigns c where c.business_id = b.id
    )
  )
  from businesses b
  where b.public_id = p_public_id and b.active = true
$$;

revoke execute on function merchant_report_by_public_id(text) from public, anon, authenticated;
