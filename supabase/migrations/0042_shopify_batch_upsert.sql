-- =============================================================
-- 0042_shopify_batch_upsert.sql — Sync Engine batch-write speedup
--
-- The outbound sync engine (0040) upserts one row per network round-trip: a
-- 250-row page becomes 250 serial PostgREST calls to the DB, and that
-- round-trip latency — not Shopify, not the queue — dominates sync wall-clock.
--
-- This migration adds array-based BATCH wrappers so the engine can send a whole
-- page as ONE call. Each wrapper loops the JSONB array IN-DATABASE and delegates
-- every element to the existing singular RPC, so column mapping / on-conflict /
-- idempotency logic stays defined in exactly ONE place (0038/0040) and per-row
-- behavior is unchanged.
--
-- STRICTLY ADDITIVE: no existing table/RPC/trigger/RLS policy is modified. The
-- singular shopify_upsert_* / shopify_ingest_order RPCs are untouched and still
-- used by the webhook path. New functions are execute-revoked from
-- public/anon/authenticated, matching 0038/0040. Tenancy: every wrapper takes
-- p_business_id and scopes every write to it via the singular RPC.
-- =============================================================

-- ---------- shopify_upsert_products_batch ----------
create or replace function shopify_upsert_products_batch(
  p_business_id uuid,
  p_products    jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'shopify_upsert_products_batch: p_products must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_products) loop
    perform shopify_upsert_product(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_upsert_products_batch(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_collections_batch ----------
create or replace function shopify_upsert_collections_batch(
  p_business_id uuid,
  p_collections jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_collections) <> 'array' then
    raise exception 'shopify_upsert_collections_batch: p_collections must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_collections) loop
    perform shopify_upsert_collection(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_upsert_collections_batch(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_discounts_batch ----------
create or replace function shopify_upsert_discounts_batch(
  p_business_id uuid,
  p_discounts   jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_discounts) <> 'array' then
    raise exception 'shopify_upsert_discounts_batch: p_discounts must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_discounts) loop
    perform shopify_upsert_discount(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_upsert_discounts_batch(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_inventory_batch ----------
create or replace function shopify_upsert_inventory_batch(
  p_business_id uuid,
  p_inventory   jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_inventory) <> 'array' then
    raise exception 'shopify_upsert_inventory_batch: p_inventory must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_inventory) loop
    perform shopify_upsert_inventory(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_upsert_inventory_batch(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_upsert_customers_batch ----------
-- Delegates to shopify_upsert_customer, which resolves CDP identity by phone and
-- recomputes analytics per row — now with zero network hop per row. A no-phone
-- customer is skipped inside the singular RPC (returns null) exactly as today,
-- but still counts toward the processed total.
create or replace function shopify_upsert_customers_batch(
  p_business_id uuid,
  p_customers   jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_customers) <> 'array' then
    raise exception 'shopify_upsert_customers_batch: p_customers must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_customers) loop
    perform shopify_upsert_customer(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_upsert_customers_batch(uuid, jsonb)
  from public, anon, authenticated;

-- ---------- shopify_ingest_orders_batch ----------
-- Delegates to the 0038 shopify_ingest_order RPC (unchanged), preserving its
-- per-order idempotency/dedup.
create or replace function shopify_ingest_orders_batch(
  p_business_id uuid,
  p_orders      jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_count int := 0;
begin
  if jsonb_typeof(p_orders) <> 'array' then
    raise exception 'shopify_ingest_orders_batch: p_orders must be a json array';
  end if;
  for v_row in select * from jsonb_array_elements(p_orders) loop
    perform shopify_ingest_order(p_business_id, v_row);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function shopify_ingest_orders_batch(uuid, jsonb)
  from public, anon, authenticated;
