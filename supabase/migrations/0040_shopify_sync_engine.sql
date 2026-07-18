-- =============================================================
-- 0040_shopify_sync_engine.sql — Shopify Sync Engine (outbound)
--
-- Builds the OPERATIONAL layer on top of the inbound webhook pipeline that
-- 0038 shipped. 0038 gave us shops/products/orders/order_items + inbound
-- idempotency; it never wrote access_token_enc and had no outbound sync. This
-- migration adds everything the outbound engine needs:
--
--   * shopify_oauth_states   — short-lived CSRF nonce for the OAuth install
--   * shopify_sync_jobs      — resumable background sync jobs (one per run)
--   * shopify_sync_state     — per-(business,resource) watermark + cursor
--   * shopify_collections    — collection mirror
--   * shopify_discounts      — discount / price-rule mirror
--   * shopify_inventory      — inventory-level mirror
--
--   * upsert RPCs   (products/collections/discounts/inventory/customers)
--   * job-lifecycle RPCs (create/start/progress/complete/fail/claim-next)
--   * read-model RPCs    (sync status, recent jobs, connection health)
--
-- STRICTLY ADDITIVE: no existing table/RPC/trigger/RLS policy is modified.
-- The 0038 inbound path (shopify_log_webhook, shopify_ingest_order) is left
-- completely untouched. New tables are RLS-locked; execute is revoked on every
-- RPC, matching 0034–0038. Tenancy: every table carries business_id NN FK
-- cascade; Shopify ids are external refs unique PER BUSINESS, never globally.
-- =============================================================

-- =============================================================
-- shopify_oauth_states — CSRF/nonce store for the OAuth install handshake.
-- A row is created when the merchant starts "Connect", and consumed (deleted)
-- in the callback after the state param is matched. Rows expire quickly.
-- =============================================================
create table if not exists shopify_oauth_states (
  state         text primary key,                       -- random nonce echoed by Shopify
  business_id   uuid not null references businesses(id) on delete cascade,
  shop_domain   text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '15 minutes')
);
create index if not exists shopify_oauth_states_business_idx
  on shopify_oauth_states (business_id);
create index if not exists shopify_oauth_states_expiry_idx
  on shopify_oauth_states (expires_at);

-- =============================================================
-- shopify_sync_jobs — one row per sync run. Jobs are resumable: `cursor`
-- holds the Shopify page_info / since_id so an interrupted job resumes where
-- it stopped. `status` drives the scheduler; `attempts`/`next_run_at` drive
-- retry with backoff. Progress counters power the dashboard.
-- =============================================================
create table if not exists shopify_sync_jobs (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  resource          text not null check (resource in
                       ('customers','products','orders','collections',
                        'inventory','discounts','all')),
  mode              text not null default 'manual' check (mode in
                       ('initial','incremental','manual','scheduled')),
  status            text not null default 'queued' check (status in
                       ('queued','running','completed','failed','cancelled')),
  cursor            text,                                 -- resume token (page_info/since_id)
  processed         int not null default 0,
  total             int,                                  -- null until known/estimated
  failed            int not null default 0,
  attempts          int not null default 0,
  max_attempts      int not null default 5,
  error             text,
  triggered_by      text not null default 'system',      -- 'merchant' | 'system' | 'webhook'
  scheduled_at      timestamptz,                          -- when a scheduled job is due
  next_run_at       timestamptz,                          -- retry-after for failed jobs
  started_at        timestamptz,
  finished_at       timestamptz,
  duration_ms       int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shopify_sync_jobs_business_time_idx
  on shopify_sync_jobs (business_id, created_at desc);
create index if not exists shopify_sync_jobs_status_idx
  on shopify_sync_jobs (status, next_run_at);
-- One in-flight job per (business, resource): prevents concurrent duplicate runs.
create unique index if not exists shopify_sync_jobs_one_active_idx
  on shopify_sync_jobs (business_id, resource)
  where status in ('queued','running');

-- =============================================================
-- shopify_sync_state — durable watermark per (business, resource). Feeds
-- incremental sync (updated_at_min) and the dashboard "last / next sync".
-- =============================================================
create table if not exists shopify_sync_state (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  resource          text not null,
  last_synced_at    timestamptz,                          -- high-water mark of source updated_at
  last_cursor       text,
  last_status       text,                                 -- mirror of last job status
  last_job_id       uuid references shopify_sync_jobs(id) on delete set null,
  next_sync_at      timestamptz,
  total_synced      int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, resource)
);
create index if not exists shopify_sync_state_business_idx
  on shopify_sync_state (business_id);

-- =============================================================
-- shopify_collections — collection mirror (custom + smart collections).
-- =============================================================
create table if not exists shopify_collections (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references businesses(id) on delete cascade,
  shopify_collection_id text not null,
  title                text,
  handle               text,
  collection_type      text,                              -- 'custom' | 'smart'
  products_count       int,
  image_url            text,
  raw                  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (business_id, shopify_collection_id)
);
create index if not exists shopify_collections_business_idx
  on shopify_collections (business_id);

-- =============================================================
-- shopify_discounts — discount code / price-rule mirror.
-- =============================================================
create table if not exists shopify_discounts (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  shopify_discount_id text not null,                      -- price_rule id (or discount node id)
  code               text,
  title              text,
  value_type         text,                                -- 'percentage' | 'fixed_amount'
  value              numeric(12,2),
  status             text,                                -- 'active' | 'expired' | 'scheduled'
  starts_at          timestamptz,
  ends_at            timestamptz,
  usage_limit        int,
  used_count         int,
  raw                jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (business_id, shopify_discount_id)
);
create index if not exists shopify_discounts_business_idx
  on shopify_discounts (business_id);

-- =============================================================
-- shopify_inventory — inventory level per (item, location).
-- =============================================================
create table if not exists shopify_inventory (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references businesses(id) on delete cascade,
  inventory_item_id     text not null,
  location_id           text not null,
  available             int,
  shopify_product_id    text,
  sku                   text,
  raw                   jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (business_id, inventory_item_id, location_id)
);
create index if not exists shopify_inventory_business_idx
  on shopify_inventory (business_id);
create index if not exists shopify_inventory_product_idx
  on shopify_inventory (business_id, shopify_product_id);

-- ---------- updated_at triggers (reuse set_updated_at from 0034) ----------
drop trigger if exists shopify_sync_jobs_set_updated_at on shopify_sync_jobs;
create trigger shopify_sync_jobs_set_updated_at
  before update on shopify_sync_jobs for each row execute function set_updated_at();
drop trigger if exists shopify_sync_state_set_updated_at on shopify_sync_state;
create trigger shopify_sync_state_set_updated_at
  before update on shopify_sync_state for each row execute function set_updated_at();
drop trigger if exists shopify_collections_set_updated_at on shopify_collections;
create trigger shopify_collections_set_updated_at
  before update on shopify_collections for each row execute function set_updated_at();
drop trigger if exists shopify_discounts_set_updated_at on shopify_discounts;
create trigger shopify_discounts_set_updated_at
  before update on shopify_discounts for each row execute function set_updated_at();
drop trigger if exists shopify_inventory_set_updated_at on shopify_inventory;
create trigger shopify_inventory_set_updated_at
  before update on shopify_inventory for each row execute function set_updated_at();

-- ---------- Lockdown: RLS on + revoke from anon/authenticated ----------
alter table shopify_oauth_states enable row level security;
alter table shopify_sync_jobs    enable row level security;
alter table shopify_sync_state   enable row level security;
alter table shopify_collections  enable row level security;
alter table shopify_discounts    enable row level security;
alter table shopify_inventory    enable row level security;

revoke all on shopify_oauth_states, shopify_sync_jobs, shopify_sync_state,
              shopify_collections, shopify_discounts, shopify_inventory
  from anon, authenticated;

-- =============================================================
-- Upsert RPCs — each takes a normalized jsonb built by the sync service and
-- upserts on the tenant-scoped external-id key. All SECURITY DEFINER, revoked.
-- =============================================================

-- ---------- shopify_upsert_product ----------
create or replace function shopify_upsert_product(
  p_business_id uuid,
  p_product     jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_ext_id text := nullif(trim(coalesce(p_product->>'shopify_product_id', '')), '');
begin
  if v_ext_id is null then
    raise exception 'shopify_upsert_product: missing shopify_product_id';
  end if;
  insert into shopify_products (
    business_id, shopify_product_id, title, handle, product_type,
    vendor, status, price, image_url, tags, raw
  ) values (
    p_business_id, v_ext_id, p_product->>'title', p_product->>'handle',
    p_product->>'product_type', p_product->>'vendor', p_product->>'status',
    (p_product->>'price')::numeric, p_product->>'image_url',
    case when jsonb_typeof(p_product->'tags') = 'array'
         then array(select jsonb_array_elements_text(p_product->'tags'))
         else null end,
    coalesce(p_product->'raw', '{}'::jsonb)
  )
  on conflict (business_id, shopify_product_id) do update
    set title        = excluded.title,
        handle       = excluded.handle,
        product_type = excluded.product_type,
        vendor       = excluded.vendor,
        status       = excluded.status,
        price        = excluded.price,
        image_url    = excluded.image_url,
        tags         = excluded.tags,
        raw          = excluded.raw,
        updated_at   = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function shopify_upsert_product(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_collection ----------
create or replace function shopify_upsert_collection(
  p_business_id uuid,
  p_collection  jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_ext_id text := nullif(trim(coalesce(p_collection->>'shopify_collection_id', '')), '');
begin
  if v_ext_id is null then
    raise exception 'shopify_upsert_collection: missing shopify_collection_id';
  end if;
  insert into shopify_collections (
    business_id, shopify_collection_id, title, handle,
    collection_type, products_count, image_url, raw
  ) values (
    p_business_id, v_ext_id, p_collection->>'title', p_collection->>'handle',
    p_collection->>'collection_type', (p_collection->>'products_count')::int,
    p_collection->>'image_url', coalesce(p_collection->'raw', '{}'::jsonb)
  )
  on conflict (business_id, shopify_collection_id) do update
    set title           = excluded.title,
        handle          = excluded.handle,
        collection_type = excluded.collection_type,
        products_count  = excluded.products_count,
        image_url       = excluded.image_url,
        raw             = excluded.raw,
        updated_at      = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function shopify_upsert_collection(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_discount ----------
create or replace function shopify_upsert_discount(
  p_business_id uuid,
  p_discount    jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_ext_id text := nullif(trim(coalesce(p_discount->>'shopify_discount_id', '')), '');
begin
  if v_ext_id is null then
    raise exception 'shopify_upsert_discount: missing shopify_discount_id';
  end if;
  insert into shopify_discounts (
    business_id, shopify_discount_id, code, title, value_type, value,
    status, starts_at, ends_at, usage_limit, used_count, raw
  ) values (
    p_business_id, v_ext_id, p_discount->>'code', p_discount->>'title',
    p_discount->>'value_type', (p_discount->>'value')::numeric,
    p_discount->>'status',
    (p_discount->>'starts_at')::timestamptz, (p_discount->>'ends_at')::timestamptz,
    (p_discount->>'usage_limit')::int, (p_discount->>'used_count')::int,
    coalesce(p_discount->'raw', '{}'::jsonb)
  )
  on conflict (business_id, shopify_discount_id) do update
    set code        = excluded.code,
        title       = excluded.title,
        value_type  = excluded.value_type,
        value       = excluded.value,
        status      = excluded.status,
        starts_at   = excluded.starts_at,
        ends_at     = excluded.ends_at,
        usage_limit = excluded.usage_limit,
        used_count  = excluded.used_count,
        raw         = excluded.raw,
        updated_at  = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function shopify_upsert_discount(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_inventory ----------
create or replace function shopify_upsert_inventory(
  p_business_id uuid,
  p_inventory   jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid;
  v_item_id  text := nullif(trim(coalesce(p_inventory->>'inventory_item_id', '')), '');
  v_loc_id   text := nullif(trim(coalesce(p_inventory->>'location_id', '')), '');
begin
  if v_item_id is null or v_loc_id is null then
    raise exception 'shopify_upsert_inventory: missing inventory_item_id/location_id';
  end if;
  insert into shopify_inventory (
    business_id, inventory_item_id, location_id, available,
    shopify_product_id, sku, raw
  ) values (
    p_business_id, v_item_id, v_loc_id, (p_inventory->>'available')::int,
    p_inventory->>'shopify_product_id', p_inventory->>'sku',
    coalesce(p_inventory->'raw', '{}'::jsonb)
  )
  on conflict (business_id, inventory_item_id, location_id) do update
    set available          = excluded.available,
        shopify_product_id = excluded.shopify_product_id,
        sku                = excluded.sku,
        raw                = excluded.raw,
        updated_at         = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function shopify_upsert_inventory(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_customer ----------
-- Wraps the CDP identity RPC (merchant_upsert_customer, phone = identity key)
-- and emits a universal profile event so a Shopify customer sync joins the 360.
create or replace function shopify_upsert_customer(
  p_business_id uuid,
  p_customer    jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_phone text := nullif(trim(coalesce(p_customer->>'phone', '')), '');
  v_email text := nullif(trim(coalesce(p_customer->>'email', '')), '');
  v_ext   text := nullif(trim(coalesce(p_customer->>'shopify_customer_id', '')), '');
begin
  -- Phone is the CDP identity key. Without it we cannot resolve/merge a
  -- customer, so skip (Shopify allows email-only customers).
  if v_phone is null then
    return null;
  end if;

  v_id := merchant_upsert_customer(
    p_business_id, v_phone,
    coalesce(nullif(trim(coalesce(p_customer->>'name','')), ''), 'Customer'),
    v_email, null, null, null, null, null, 'shopify'
  );

  perform record_event(
    p_business_id, 'customer.synced', 'profile', v_id, null, 'shopify',
    jsonb_build_object('shopify_customer_id', v_ext, 'email', v_email),
    case when v_ext is not null then 'shopify:customer:' || v_ext else null end,
    now()
  );

  if v_id is not null then
    perform recompute_customer_analytics(p_business_id, v_id);
  end if;
  return v_id;
end $$;
revoke execute on function shopify_upsert_customer(uuid, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- Job-lifecycle RPCs. The service layer drives a job through:
--   create → start → (progress …) → complete | fail
-- The scheduler uses claim_next to atomically pick a due job.
-- =============================================================

-- ---------- shopify_create_sync_job ----------
-- Creates a queued job. The partial unique index guarantees at most one
-- active job per (business, resource); on conflict we return the existing
-- active job's id instead of erroring (idempotent enqueue).
create or replace function shopify_create_sync_job(
  p_business_id  uuid,
  p_resource     text,
  p_mode         text default 'manual',
  p_triggered_by text default 'system',
  p_scheduled_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into shopify_sync_jobs (
    business_id, resource, mode, triggered_by, scheduled_at, status
  ) values (
    p_business_id, p_resource, coalesce(p_mode,'manual'),
    coalesce(p_triggered_by,'system'), p_scheduled_at, 'queued'
  )
  on conflict (business_id, resource) where status in ('queued','running')
    do nothing
  returning id into v_id;

  if v_id is null then
    -- An active job already exists — return it (idempotent).
    select id into v_id from shopify_sync_jobs
     where business_id = p_business_id and resource = p_resource
       and status in ('queued','running')
     order by created_at desc limit 1;
  end if;
  return v_id;
end $$;
revoke execute on function shopify_create_sync_job(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;

-- ---------- shopify_start_sync_job ----------
-- Atomically claim a queued job for processing. Returns true only to the caller
-- that won the transition queued→running; a concurrent worker (or the cron
-- scheduler) that already claimed it gets false and must not process. This is
-- what prevents the immediate-trigger path and the scheduler from double-
-- advancing the same job's cursor. Does NOT touch `attempts` (failures only).
create or replace function shopify_start_sync_job(
  p_business_id uuid,
  p_job_id      uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_claimed boolean := false;
begin
  update shopify_sync_jobs
     set status     = 'running',
         started_at = coalesce(started_at, now()),
         error      = null,
         next_run_at = null
   where id = p_job_id and business_id = p_business_id
     and status = 'queued';
  get diagnostics v_claimed = row_count;
  return v_claimed;
end $$;
revoke execute on function shopify_start_sync_job(uuid, uuid)
  from public, anon, authenticated;

-- ---------- shopify_update_sync_progress ----------
-- Persists the resume cursor + counters mid-run so an interrupted job resumes.
create or replace function shopify_update_sync_progress(
  p_business_id uuid,
  p_job_id      uuid,
  p_processed   int,
  p_failed      int default 0,
  p_cursor      text default null,
  p_total       int default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update shopify_sync_jobs
     set processed = coalesce(p_processed, processed),
         failed    = coalesce(p_failed, failed),
         cursor    = p_cursor,
         total     = coalesce(p_total, total)
   where id = p_job_id and business_id = p_business_id;
end $$;
revoke execute on function shopify_update_sync_progress(uuid, uuid, int, int, text, int)
  from public, anon, authenticated;

-- ---------- shopify_complete_sync_job ----------
-- Marks a job done and advances the per-resource watermark in one txn.
create or replace function shopify_complete_sync_job(
  p_business_id   uuid,
  p_job_id        uuid,
  p_last_synced_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_resource text;
  v_started  timestamptz;
  v_processed int;
begin
  update shopify_sync_jobs
     set status      = 'completed',
         finished_at = now(),
         cursor      = null,
         next_run_at = null,
         duration_ms = case when started_at is not null
                            then (extract(epoch from (now() - started_at)) * 1000)::int
                            else null end
   where id = p_job_id and business_id = p_business_id
   returning resource, started_at, processed into v_resource, v_started, v_processed;

  if v_resource is null then
    return;  -- job not found for this tenant; no-op
  end if;

  insert into shopify_sync_state (
    business_id, resource, last_synced_at, last_status, last_job_id, total_synced
  ) values (
    p_business_id, v_resource, coalesce(p_last_synced_at, now()),
    'completed', p_job_id, coalesce(v_processed, 0)
  )
  on conflict (business_id, resource) do update
    set last_synced_at = coalesce(p_last_synced_at, now()),
        last_status    = 'completed',
        last_job_id    = p_job_id,
        last_cursor    = null,
        total_synced   = shopify_sync_state.total_synced + coalesce(v_processed, 0),
        updated_at     = now();
end $$;
revoke execute on function shopify_complete_sync_job(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------- shopify_fail_sync_job ----------
-- Increments the failure counter, records the error, and schedules a retry with
-- exponential backoff until max_attempts is hit, after which the job is
-- terminally 'failed'. This is the ONLY place `attempts` is bumped.
create or replace function shopify_fail_sync_job(
  p_business_id uuid,
  p_job_id      uuid,
  p_error       text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_attempts int;
  v_max      int;
  v_resource text;
begin
  update shopify_sync_jobs
     set attempts = attempts + 1
   where id = p_job_id and business_id = p_business_id
   returning attempts, max_attempts, resource
     into v_attempts, v_max, v_resource;

  if v_resource is null then
    return;
  end if;

  if v_attempts >= v_max then
    -- Terminal failure: give up and free the (business,resource) slot.
    update shopify_sync_jobs
       set status = 'failed', error = p_error, finished_at = now(),
           duration_ms = case when started_at is not null
                              then (extract(epoch from (now() - started_at)) * 1000)::int
                              else null end
     where id = p_job_id and business_id = p_business_id;
  else
    -- Requeue for retry with backoff: 2^attempts minutes (capped ~1h).
    update shopify_sync_jobs
       set status = 'queued', error = p_error,
           next_run_at = now() + (least(power(2, v_attempts), 60) || ' minutes')::interval
     where id = p_job_id and business_id = p_business_id;
  end if;

  update shopify_sync_state
     set last_status = 'failed', updated_at = now()
   where business_id = p_business_id and resource = v_resource;
end $$;
revoke execute on function shopify_fail_sync_job(uuid, uuid, text)
  from public, anon, authenticated;

-- ---------- shopify_claim_next_sync_job ----------
-- Atomically claim the next due job across all tenants for the scheduler.
-- SKIP LOCKED lets multiple workers run without double-processing.
create or replace function shopify_claim_next_sync_job()
returns shopify_sync_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job shopify_sync_jobs;
begin
  select * into v_job
    from shopify_sync_jobs
   where status = 'queued'
     and (next_run_at is null or next_run_at <= now())
     and (scheduled_at is null or scheduled_at <= now())
   order by created_at asc
   for update skip locked
   limit 1;

  if v_job.id is null then
    return null;
  end if;

  update shopify_sync_jobs
     set status = 'running',
         started_at = coalesce(started_at, now()), error = null
   where id = v_job.id
   returning * into v_job;
  return v_job;
end $$;
revoke execute on function shopify_claim_next_sync_job()
  from public, anon, authenticated;

-- =============================================================
-- Read-model RPCs — power the merchant dashboard. Read-only, tenant-scoped.
-- =============================================================

-- ---------- shopify_sync_status: per-resource state bundle ----------
create or replace function shopify_sync_status(
  p_business_id uuid
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  from (
    select resource, last_synced_at, last_status, next_sync_at, total_synced, updated_at
      from shopify_sync_state
     where business_id = p_business_id
     order by resource
  ) s;
$$;
revoke execute on function shopify_sync_status(uuid)
  from public, anon, authenticated;

-- ---------- shopify_recent_sync_jobs: last N jobs ----------
create or replace function shopify_recent_sync_jobs(
  p_business_id uuid,
  p_limit       int default 20
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(j)), '[]'::jsonb)
  from (
    select id, resource, mode, status, processed, total, failed,
           attempts, error, triggered_by, started_at, finished_at,
           duration_ms, created_at
      from shopify_sync_jobs
     where business_id = p_business_id
     order by created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) j;
$$;
revoke execute on function shopify_recent_sync_jobs(uuid, int)
  from public, anon, authenticated;

-- ---------- shopify_connection_health: single-object health snapshot ----------
-- Combines shop connection state, webhook throughput (last 24h), any active
-- job, and the newest error into one bundle for the dashboard header.
create or replace function shopify_connection_health(
  p_business_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_shop      record;
  v_webhooks  record;
  v_active    record;
  v_last_err  text;
begin
  select shop_domain, status, installed_at,
         (access_token_enc is not null) as has_token
    into v_shop
    from shopify_shops
   where business_id = p_business_id
   limit 1;

  select count(*) filter (where status = 'processed') as processed,
         count(*) filter (where status = 'failed')    as failed,
         count(*)                                      as total
    into v_webhooks
    from shopify_webhook_log
   where business_id = p_business_id
     and received_at > now() - interval '24 hours';

  select resource, status, processed, total
    into v_active
    from shopify_sync_jobs
   where business_id = p_business_id and status = 'running'
   order by started_at desc nulls last limit 1;

  select error into v_last_err
    from shopify_sync_jobs
   where business_id = p_business_id and error is not null
   order by created_at desc limit 1;

  return jsonb_build_object(
    'connected',   coalesce(v_shop.has_token, false) and coalesce(v_shop.status,'') = 'active',
    'shop_domain', v_shop.shop_domain,
    'status',      v_shop.status,
    'installed_at',v_shop.installed_at,
    'webhooks_24h', jsonb_build_object(
        'processed', coalesce(v_webhooks.processed, 0),
        'failed',    coalesce(v_webhooks.failed, 0),
        'total',     coalesce(v_webhooks.total, 0)),
    'active_job', case when v_active.resource is not null then jsonb_build_object(
        'resource', v_active.resource, 'status', v_active.status,
        'processed', v_active.processed, 'total', v_active.total) else null end,
    'last_error', v_last_err
  );
end $$;
revoke execute on function shopify_connection_health(uuid)
  from public, anon, authenticated;

-- =============================================================
-- shopify_enqueue_due_syncs — the SCHEDULER's enqueue step.
--
-- For every connected (active + tokened) shop and every resource whose
-- per-resource watermark is older than p_interval_minutes (or has never
-- synced), enqueue ONE incremental 'scheduled' job — but only when that
-- (business, resource) has no job already queued/running, so a slow sync is
-- never piled on. Returns the number of jobs freshly enqueued.
--
-- Kept in SQL (not the cron route) so the "which stores are due" decision is a
-- single set-based pass the scheduler route merely triggers; the route then
-- drains the queue in the background. SECURITY DEFINER + execute revoked, like
-- every other RPC here — the cron route reaches it via the service-role client.
-- =============================================================
create or replace function shopify_enqueue_due_syncs(
  p_interval_minutes int default 60
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count     int := 0;
  v_shop      record;
  v_resource  text;
  v_resources text[] := array[
    'customers','products','orders','collections','inventory','discounts'];
  v_last      timestamptz;
  v_job       uuid;
begin
  for v_shop in
    select business_id from shopify_shops
     where status = 'active' and access_token_enc is not null
  loop
    foreach v_resource in array v_resources loop
      select last_synced_at into v_last
        from shopify_sync_state
       where business_id = v_shop.business_id and resource = v_resource;

      -- Due when never synced, or the watermark is older than the interval.
      if (v_last is null
          or v_last <= now() - (greatest(p_interval_minutes, 1) || ' minutes')::interval)
         and not exists (
           select 1 from shopify_sync_jobs
            where business_id = v_shop.business_id
              and resource = v_resource
              and status in ('queued','running'))
      then
        v_job := shopify_create_sync_job(
          v_shop.business_id, v_resource, 'scheduled', 'system', null);
        if v_job is not null then
          v_count := v_count + 1;
          -- Stamp the next-due time so the dashboard can show "next sync" and a
          -- burst of ticks doesn't reconsider this resource until it's due again.
          insert into shopify_sync_state (business_id, resource, next_sync_at)
          values (v_shop.business_id, v_resource,
                  now() + (greatest(p_interval_minutes, 1) || ' minutes')::interval)
          on conflict (business_id, resource) do update
            set next_sync_at = excluded.next_sync_at, updated_at = now();
        end if;
      end if;
    end loop;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_enqueue_due_syncs(int)
  from public, anon, authenticated;
