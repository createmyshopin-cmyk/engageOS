-- =============================================================
-- EngageOS — Migration 0033: Universal Marketing Tracking Engine
--
-- Adds a pluggable marketing-pixel tracking layer WITHOUT touching the
-- Scratch / Reward / Coupon / Campaign / Analytics engines, WATI, the
-- existing customer-event system, or campaign_display. It is strictly
-- additive.
--
-- Two new tables:
--   business_tracking_integrations — per-business defaults, one row per
--     (business, provider). Holds only PUBLIC publishable pixel/tag IDs
--     (Meta Pixel ID, GA4 Measurement ID, …) — NOT secrets. These IDs are
--     designed to be embedded in the browser, so unlike WATI tokens they
--     are not encrypted. Tenant isolation still applies: a merchant only
--     ever reads/writes its own rows.
--   campaign_tracking_overrides — optional per-campaign overrides. When a
--     campaign sets tracking_use_default = false, its overrides win;
--     otherwise business defaults apply.
--
-- Lockdown matches 0030/0027/0004: RLS default-deny, all grants revoked
-- from anon/authenticated. Merchant writes go through SECURITY DEFINER
-- RPCs (service-role only) that re-check tenant ownership in SQL.
--
-- resolve_campaign_tracking() is the ONE function the customer app calls.
-- It returns only enabled providers' public IDs for a single live
-- campaign, so it is safe to grant to anon/authenticated.
-- =============================================================

-- ---------- Provider key domain (shared by both tables) ----------
-- 8 launch providers. Adding a provider later = add its key here.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tracking_provider') then
    create type tracking_provider as enum (
      'meta_pixel',
      'gtm',
      'ga4',
      'clarity',
      'microsoft_ads',
      'tiktok',
      'linkedin',
      'pinterest'
    );
  end if;
end $$;

-- ---------- Business-level defaults ----------
create table if not exists business_tracking_integrations (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  provider          tracking_provider not null,
  enabled           boolean not null default false,
  provider_id       text,                    -- PUBLIC publishable id (e.g. Meta Pixel ID)
  notes             text,
  status            text not null default 'disconnected'
                    check (status in ('connected', 'error', 'disconnected')),
  last_verified_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, provider)
);

create index if not exists idx_bti_business on business_tracking_integrations (business_id);

-- ---------- Campaign-level overrides ----------
create table if not exists campaign_tracking_overrides (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  provider     tracking_provider not null,
  enabled      boolean not null default false,
  provider_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, provider)
);

create index if not exists idx_cto_campaign on campaign_tracking_overrides (campaign_id);

-- ---------- Campaign default-vs-override switch ----------
alter table campaigns
  add column if not exists tracking_use_default boolean not null default true;

-- ---------- Lockdown: default-deny, service-role only ----------
alter table business_tracking_integrations enable row level security;
revoke all on business_tracking_integrations from anon, authenticated;

alter table campaign_tracking_overrides enable row level security;
revoke all on campaign_tracking_overrides from anon, authenticated;

-- =============================================================
-- RPCs
-- =============================================================

-- Upsert a business-level provider config. Tenant safety: business_id is
-- supplied by trusted server code (the merchant's own session), and the
-- row is keyed to it. Service-role only.
create or replace function merchant_upsert_tracking_integration(
  p_business_id uuid,
  p_provider    tracking_provider,
  p_enabled     boolean,
  p_provider_id text,
  p_notes       text,
  p_status      text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into business_tracking_integrations
    (business_id, provider, enabled, provider_id, notes, status, updated_at)
  values
    (p_business_id, p_provider, p_enabled,
     nullif(trim(coalesce(p_provider_id, '')), ''),
     nullif(trim(coalesce(p_notes, '')), ''),
     coalesce(p_status, 'disconnected'), now())
  on conflict (business_id, provider) do update
    set enabled          = excluded.enabled,
        provider_id      = excluded.provider_id,
        notes            = excluded.notes,
        status           = excluded.status,
        last_verified_at = case when excluded.status = 'connected'
                                then now() else business_tracking_integrations.last_verified_at end,
        updated_at       = now();
end $$;

revoke execute on function merchant_upsert_tracking_integration(
  uuid, tracking_provider, boolean, text, text, text
) from public, anon, authenticated;

-- Flip a campaign between business-default and campaign-specific tracking.
-- Tenant-checked: the campaign must belong to the calling business.
create or replace function merchant_set_campaign_tracking_mode(
  p_business_id uuid,
  p_campaign_id uuid,
  p_use_default boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update campaigns c
     set tracking_use_default = p_use_default
   where c.id = p_campaign_id
     and c.business_id = p_business_id;
  if not found then
    raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
  end if;
end $$;

revoke execute on function merchant_set_campaign_tracking_mode(uuid, uuid, boolean)
  from public, anon, authenticated;

-- Upsert a per-campaign override. Tenant safety enforced by the
-- campaign->business join: the override only applies if the campaign
-- belongs to the calling business. Service-role only.
create or replace function merchant_upsert_campaign_tracking_override(
  p_business_id uuid,
  p_campaign_id uuid,
  p_provider    tracking_provider,
  p_enabled     boolean,
  p_provider_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from campaigns
     where id = p_campaign_id and business_id = p_business_id
  ) then
    raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
  end if;

  insert into campaign_tracking_overrides
    (campaign_id, provider, enabled, provider_id, updated_at)
  values
    (p_campaign_id, p_provider, p_enabled,
     nullif(trim(coalesce(p_provider_id, '')), ''), now())
  on conflict (campaign_id, provider) do update
    set enabled     = excluded.enabled,
        provider_id = excluded.provider_id,
        updated_at  = now();
end $$;

revoke execute on function merchant_upsert_campaign_tracking_override(
  uuid, uuid, tracking_provider, boolean, text
) from public, anon, authenticated;

-- Resolve the effective tracking config for a single LIVE campaign,
-- addressed by (merchant_slug, campaign_slug) exactly like campaign_display.
-- Returns a JSON array of { provider, provider_id } for every ENABLED
-- provider that has a non-empty id. When the campaign opts into
-- campaign-specific tracking, its overrides are used; otherwise business
-- defaults. Only public IDs leave the DB, so this is anon-safe.
create or replace function resolve_campaign_tracking(
  p_merchant_slug text,
  p_slug          text
) returns jsonb
language sql stable security definer set search_path = public as $$
  with camp as (
    select c.id, c.business_id, c.tracking_use_default
    from campaigns c
    join businesses b on b.id = c.business_id
    where c.slug = p_slug
      and b.slug = p_merchant_slug
      and c.status = 'active'
      and now() between c.starts_at and c.ends_at
      and b.active = true
  ),
  resolved as (
    -- Business defaults (used when tracking_use_default = true)
    select bti.provider::text as provider, bti.provider_id
    from camp
    join business_tracking_integrations bti on bti.business_id = camp.business_id
    where camp.tracking_use_default = true
      and bti.enabled = true
      and nullif(trim(coalesce(bti.provider_id, '')), '') is not null
    union all
    -- Campaign overrides (used when tracking_use_default = false)
    select cto.provider::text as provider, cto.provider_id
    from camp
    join campaign_tracking_overrides cto on cto.campaign_id = camp.id
    where camp.tracking_use_default = false
      and cto.enabled = true
      and nullif(trim(coalesce(cto.provider_id, '')), '') is not null
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('provider', provider, 'provider_id', provider_id)),
    '[]'::jsonb
  )
  from resolved;
$$;

grant execute on function resolve_campaign_tracking(text, text) to anon, authenticated;
