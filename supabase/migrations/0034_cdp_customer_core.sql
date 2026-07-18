-- =============================================================
-- EngageOS CDP — Migration 0034: Customer Data Platform Core
--
-- Phase 1 of the permanent CDP foundation. STRICTLY ADDITIVE:
-- the existing customers table is EXTENDED with nullable/defaulted
-- columns only, so the play-engine upsert on (business_id, phone)
-- (see 0020 play_campaign) keeps working unchanged. No existing
-- table, RPC, trigger, RLS policy, or engine is modified.
--
-- Adds:
--   * rich profile columns on customers (email, birthday, consents,
--     soft delete, merged-account pointer, acquisition source)
--   * companion tables keyed by customer_id (addresses, consents,
--     preferences, devices, notes, custom fields, tags + tag map)
--   * merchant-facing SECURITY DEFINER RPCs (all revoked from the
--     public API surface, service-role only — same contract as 0033)
--
-- Lockdown matches 0004/0011/0027/0033: RLS default-deny, all grants
-- revoked from anon/authenticated.
-- =============================================================

-- ---------- Generic updated_at trigger (reusable across CDP tables) ----------
-- Mirrors merchants_set_updated_at() from 0006, generalized so every
-- CDP table can share one trigger function.
create or replace function set_updated_at()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================
-- Extend customers — all columns nullable or defaulted.
-- =============================================================
alter table customers add column if not exists email text;
alter table customers add column if not exists email_normalized text;
alter table customers add column if not exists full_name text;
alter table customers add column if not exists gender text
  check (gender is null or gender in ('male','female','other','undisclosed'));
alter table customers add column if not exists birthday date;
alter table customers add column if not exists anniversary date;
alter table customers add column if not exists language text default 'en';
alter table customers add column if not exists timezone text default 'Asia/Kolkata';
alter table customers add column if not exists profile_image_url text;

-- Denormalized latest consent state. Source-of-truth history lives in
-- customer_consents; these mirror the newest row per channel for fast reads.
-- (wa_opt_out already exists from 0027.)
alter table customers add column if not exists marketing_opt_in boolean not null default false;
alter table customers add column if not exists email_opt_in boolean not null default false;
alter table customers add column if not exists sms_opt_in boolean not null default false;

-- Lifecycle + identity resolution.
alter table customers add column if not exists updated_at timestamptz not null default now();
alter table customers add column if not exists deleted_at timestamptz;
alter table customers add column if not exists merged_into uuid references customers(id);
alter table customers add column if not exists source text;
alter table customers add column if not exists external_ref text;

-- Email dedup per tenant (only for active, email-bearing rows).
create unique index if not exists customers_email_unique_idx
  on customers (business_id, email_normalized)
  where email_normalized is not null and deleted_at is null;

create index if not exists customers_email_idx
  on customers (business_id, email_normalized);
create index if not exists customers_active_idx
  on customers (business_id) where deleted_at is null;
create index if not exists customers_merged_idx
  on customers (merged_into) where merged_into is not null;

drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- =============================================================
-- Companion tables
-- =============================================================

-- ---------- Addresses ----------
create table if not exists customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  label        text,
  line1        text,
  line2        text,
  city         text,
  state        text,
  postal_code  text,
  country      text not null default 'IN',
  is_default   boolean not null default false,
  geo_lat      numeric(9,6),
  geo_lng      numeric(9,6),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customer_addresses_customer_idx
  on customer_addresses (customer_id);
create unique index if not exists customer_addresses_one_default_idx
  on customer_addresses (customer_id) where is_default;
drop trigger if exists customer_addresses_updated_at on customer_addresses;
create trigger customer_addresses_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

-- ---------- Consents (history; latest row mirrors customers booleans) ----------
create table if not exists customer_consents (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  channel       text not null check (channel in ('whatsapp','email','sms','push')),
  status        text not null check (status in ('granted','revoked')),
  source        text,
  consented_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists customer_consents_customer_idx
  on customer_consents (customer_id, channel, consented_at desc);
drop trigger if exists customer_consents_updated_at on customer_consents;
create trigger customer_consents_updated_at
  before update on customer_consents
  for each row execute function set_updated_at();

-- ---------- Preferences (typed KV) ----------
create table if not exists customer_preferences (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  key          text not null,
  value        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (customer_id, key)
);
create index if not exists customer_preferences_customer_idx
  on customer_preferences (customer_id);
drop trigger if exists customer_preferences_updated_at on customer_preferences;
create trigger customer_preferences_updated_at
  before update on customer_preferences
  for each row execute function set_updated_at();

-- ---------- Devices ----------
create table if not exists customer_devices (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  platform      text,
  device_token  text not null,
  user_agent    text,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (customer_id, device_token)
);
create index if not exists customer_devices_customer_idx
  on customer_devices (customer_id);
drop trigger if exists customer_devices_updated_at on customer_devices;
create trigger customer_devices_updated_at
  before update on customer_devices
  for each row execute function set_updated_at();

-- ---------- Notes (merchant-authored) ----------
create table if not exists customer_notes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  merchant_id  uuid references merchants(id) on delete set null,
  body         text not null,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customer_notes_customer_idx
  on customer_notes (customer_id, created_at desc);
drop trigger if exists customer_notes_updated_at on customer_notes;
create trigger customer_notes_updated_at
  before update on customer_notes
  for each row execute function set_updated_at();

-- ---------- Custom fields (tenant-defined attributes) ----------
create table if not exists customer_custom_fields (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  key          text not null,
  value        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (customer_id, key)
);
create index if not exists customer_custom_fields_customer_idx
  on customer_custom_fields (customer_id);
drop trigger if exists customer_custom_fields_updated_at on customer_custom_fields;
create trigger customer_custom_fields_updated_at
  before update on customer_custom_fields
  for each row execute function set_updated_at();

-- ---------- Tag catalog + map ----------
create table if not exists customer_tags (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  color        text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, name)
);
create index if not exists customer_tags_business_idx
  on customer_tags (business_id);
drop trigger if exists customer_tags_updated_at on customer_tags;
create trigger customer_tags_updated_at
  before update on customer_tags
  for each row execute function set_updated_at();

create table if not exists customer_tag_map (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  tag_id       uuid not null references customer_tags(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (customer_id, tag_id)
);
create index if not exists customer_tag_map_customer_idx
  on customer_tag_map (customer_id);
create index if not exists customer_tag_map_tag_idx
  on customer_tag_map (tag_id);

-- =============================================================
-- Lockdown: default-deny, service-role only.
-- =============================================================
alter table customer_addresses      enable row level security;
alter table customer_consents       enable row level security;
alter table customer_preferences    enable row level security;
alter table customer_devices        enable row level security;
alter table customer_notes          enable row level security;
alter table customer_custom_fields  enable row level security;
alter table customer_tags           enable row level security;
alter table customer_tag_map        enable row level security;

revoke all on customer_addresses     from anon, authenticated;
revoke all on customer_consents      from anon, authenticated;
revoke all on customer_preferences   from anon, authenticated;
revoke all on customer_devices       from anon, authenticated;
revoke all on customer_notes         from anon, authenticated;
revoke all on customer_custom_fields from anon, authenticated;
revoke all on customer_tags          from anon, authenticated;
revoke all on customer_tag_map       from anon, authenticated;

-- =============================================================
-- RPCs — all SECURITY DEFINER, service-role only (execute revoked).
-- Tenant safety: p_business_id is resolved from the merchant session,
-- never the URL, and every write is keyed/checked against it.
-- =============================================================

-- Upsert a customer by (business_id, phone). Enriches the profile
-- without disturbing the play-engine upsert. Returns the customer id.
create or replace function merchant_upsert_customer(
  p_business_id uuid,
  p_phone       text,
  p_name        text,
  p_email       text default null,
  p_gender      text default null,
  p_birthday    date default null,
  p_anniversary date default null,
  p_language    text default null,
  p_timezone    text default null,
  p_source      text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_customer_id uuid;
  v_email       text := nullif(trim(coalesce(p_email, '')), '');
  v_email_norm  text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  insert into customers (business_id, phone, name)
  values (p_business_id, p_phone, coalesce(nullif(trim(p_name), ''), 'Customer'))
  on conflict (business_id, phone) do update
    set name = coalesce(nullif(trim(excluded.name), ''), customers.name)
  returning id into v_customer_id;

  update customers set
    email            = coalesce(v_email, email),
    email_normalized = coalesce(v_email_norm, email_normalized),
    full_name        = coalesce(nullif(trim(coalesce(p_name, '')), ''), full_name),
    gender           = coalesce(p_gender, gender),
    birthday         = coalesce(p_birthday, birthday),
    anniversary      = coalesce(p_anniversary, anniversary),
    language         = coalesce(nullif(trim(coalesce(p_language, '')), ''), language),
    timezone         = coalesce(nullif(trim(coalesce(p_timezone, '')), ''), timezone),
    source           = coalesce(source, nullif(trim(coalesce(p_source, '')), ''))
  where id = v_customer_id and business_id = p_business_id;

  return v_customer_id;
end $$;

revoke execute on function merchant_upsert_customer(uuid, text, text, text, text, date, date, text, text, text)
  from public, anon, authenticated;

-- Record a consent decision and sync the denormalized boolean on customers.
create or replace function merchant_set_consent(
  p_business_id uuid,
  p_customer_id uuid,
  p_channel     text,
  p_status      text,
  p_source      text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_granted boolean := (p_status = 'granted');
begin
  if not exists (
    select 1 from customers
     where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  insert into customer_consents (business_id, customer_id, channel, status, source)
  values (p_business_id, p_customer_id, p_channel, p_status,
          nullif(trim(coalesce(p_source, '')), ''));

  update customers set
    marketing_opt_in = case when p_channel = 'whatsapp' then v_granted else marketing_opt_in end,
    email_opt_in     = case when p_channel = 'email'    then v_granted else email_opt_in end,
    sms_opt_in       = case when p_channel = 'sms'      then v_granted else sms_opt_in end,
    wa_opt_out       = case when p_channel = 'whatsapp' then not v_granted else wa_opt_out end
  where id = p_customer_id and business_id = p_business_id;
end $$;

revoke execute on function merchant_set_consent(uuid, uuid, text, text, text)
  from public, anon, authenticated;

-- Attach a tag to a customer (creates the tag in the catalog on first use).
create or replace function merchant_add_customer_tag(
  p_business_id uuid,
  p_customer_id uuid,
  p_tag_name    text,
  p_color       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tag    uuid;
begin
  if not exists (
    select 1 from customers
     where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  insert into customer_tags (business_id, name, color)
  values (p_business_id, trim(p_tag_name), nullif(trim(coalesce(p_color, '')), ''))
  on conflict (business_id, name) do update set color = coalesce(excluded.color, customer_tags.color)
  returning id into v_tag;

  insert into customer_tag_map (business_id, customer_id, tag_id)
  values (p_business_id, p_customer_id, v_tag)
  on conflict (customer_id, tag_id) do nothing;

  return v_tag;
end $$;

revoke execute on function merchant_add_customer_tag(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function merchant_remove_customer_tag(
  p_business_id uuid,
  p_customer_id uuid,
  p_tag_id      uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from customer_tag_map
   where business_id = p_business_id
     and customer_id = p_customer_id
     and tag_id = p_tag_id;
end $$;

revoke execute on function merchant_remove_customer_tag(uuid, uuid, uuid)
  from public, anon, authenticated;

-- Soft-delete a customer (preserves event history + coupons for reporting).
create or replace function soft_delete_customer(
  p_business_id uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update customers set deleted_at = now()
   where id = p_customer_id and business_id = p_business_id and deleted_at is null;
end $$;

revoke execute on function soft_delete_customer(uuid, uuid)
  from public, anon, authenticated;

-- Merge a duplicate customer into a survivor. Repoints all references,
-- flags the duplicate as merged + soft-deleted. Ownership-checked.
-- NOTE: repointing plays can violate plays' unique(campaign_id,customer_id)
-- when both customers played the same campaign; those rows are dropped
-- (the survivor keeps its own play) so the invariant is preserved.
create or replace function merge_customers(
  p_business_id  uuid,
  p_survivor_id  uuid,
  p_duplicate_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_survivor_id = p_duplicate_id then
    raise exception 'cannot merge a customer into itself';
  end if;
  if not exists (select 1 from customers where id = p_survivor_id and business_id = p_business_id) then
    raise exception 'survivor % not owned by business %', p_survivor_id, p_business_id;
  end if;
  if not exists (select 1 from customers where id = p_duplicate_id and business_id = p_business_id) then
    raise exception 'duplicate % not owned by business %', p_duplicate_id, p_business_id;
  end if;

  -- Drop duplicate's plays for campaigns the survivor already played
  -- (would collide on plays.unique(campaign_id, customer_id)).
  delete from plays d
   where d.customer_id = p_duplicate_id
     and exists (select 1 from plays s
                  where s.customer_id = p_survivor_id and s.campaign_id = d.campaign_id);
  update plays  set customer_id = p_survivor_id where customer_id = p_duplicate_id;
  update coupons set customer_id = p_survivor_id where customer_id = p_duplicate_id;

  -- customer_events is append-only (0011 immutability trigger). We do NOT
  -- repoint historic funnel events; the merged_into pointer lets read-models
  -- follow the chain. Companion tables move to the survivor.
  update customer_addresses     set customer_id = p_survivor_id where customer_id = p_duplicate_id;
  update customer_preferences   set customer_id = p_survivor_id where customer_id = p_duplicate_id
     and key not in (select key from customer_preferences where customer_id = p_survivor_id);
  update customer_devices       set customer_id = p_survivor_id where customer_id = p_duplicate_id
     and device_token not in (select device_token from customer_devices where customer_id = p_survivor_id);
  update customer_notes         set customer_id = p_survivor_id where customer_id = p_duplicate_id;
  update customer_custom_fields set customer_id = p_survivor_id where customer_id = p_duplicate_id
     and key not in (select key from customer_custom_fields where customer_id = p_survivor_id);
  update customer_consents      set customer_id = p_survivor_id where customer_id = p_duplicate_id;
  update customer_tag_map       set customer_id = p_survivor_id where customer_id = p_duplicate_id
     and tag_id not in (select tag_id from customer_tag_map where customer_id = p_survivor_id);

  update customers
     set merged_into = p_survivor_id, deleted_at = now()
   where id = p_duplicate_id and business_id = p_business_id;
end $$;

revoke execute on function merge_customers(uuid, uuid, uuid)
  from public, anon, authenticated;

-- Duplicate-candidate finder for a merge-review UI. Groups active
-- customers that share a normalized email within the tenant.
create or replace function find_duplicate_customers(p_business_id uuid)
returns table (
  email_normalized text,
  customer_count   bigint,
  customer_ids     uuid[]
)
language sql stable security definer set search_path = public as $$
  select
    c.email_normalized,
    count(*) as customer_count,
    array_agg(c.id order by c.created_at) as customer_ids
  from customers c
  where c.business_id = p_business_id
    and c.deleted_at is null
    and c.email_normalized is not null
  group by c.email_normalized
  having count(*) > 1
  order by count(*) desc;
$$;

revoke execute on function find_duplicate_customers(uuid)
  from public, anon, authenticated;
