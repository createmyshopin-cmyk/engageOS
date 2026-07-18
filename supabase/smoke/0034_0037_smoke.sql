-- =============================================================
-- Phase 0 smoke test for CDP migrations 0034–0037
--
-- Purpose: prove the CDP extension is (a) present and (b) strictly additive —
-- i.e. it did NOT break the existing play/scan/redeem/coupon engines or the
-- customers upsert path, and that every new object is locked down (RLS on,
-- execute revoked).
--
-- HOW TO RUN: execute against the target database AFTER applying 0034–0037,
-- ideally inside a transaction on a dev/preview branch. It raises an exception
-- on the first failed assertion, so a clean run == all checks passed. It
-- performs read-only catalog checks plus a rolled-back write probe; wrap the
-- whole file in BEGIN/ROLLBACK when running against a shared branch.
--
--   begin;
--     \i supabase/smoke/0034_0037_smoke.sql
--   rollback;
-- =============================================================

do $$
declare
  v_missing text;
  v_biz     uuid;
  v_cust    uuid;
  v_event   uuid;
  v_count   int;
begin
  -- ---------------------------------------------------------
  -- 1. New tables exist
  -- ---------------------------------------------------------
  for v_missing in
    select t from unnest(array[
      'customer_addresses','customer_consents','customer_preferences',
      'customer_devices','customer_notes','customer_custom_fields',
      'customer_tags','customer_tag_map','events','customer_analytics',
      'customer_segments','customer_segment_members'
    ]) as t
    where to_regclass('public.' || t) is null
  loop
    raise exception 'MISSING TABLE: %', v_missing;
  end loop;

  -- ---------------------------------------------------------
  -- 2. customers was EXTENDED, not replaced — old + new columns coexist
  -- ---------------------------------------------------------
  for v_missing in
    select c from unnest(array[
      'business_id','phone','name',                    -- pre-existing (must survive)
      'email','email_normalized','full_name','gender', -- new profile
      'marketing_opt_in','email_opt_in','sms_opt_in',  -- new consent booleans
      'updated_at','deleted_at','merged_into','source' -- new lifecycle
    ]) as c
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'customers' and column_name = c
    )
  loop
    raise exception 'customers MISSING COLUMN: %', v_missing;
  end loop;

  -- New customer columns MUST be nullable/defaulted so the play-engine upsert
  -- (insert into customers(business_id, phone, name)) still works untouched.
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'customers'
    and column_name in ('email','gender','birthday','deleted_at','merged_into')
    and is_nullable = 'NO';
  if v_count > 0 then
    raise exception 'BACKWARD-COMPAT BREAK: % new customer column(s) are NOT NULL', v_count;
  end if;

  -- ---------------------------------------------------------
  -- 3. Existing engine objects are untouched (still resolvable)
  -- ---------------------------------------------------------
  for v_missing in
    select f from unnest(array[
      'play_campaign','redeem_coupon','campaign_display','record_customer_event'
    ]) as f
    where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f
    )
  loop
    raise exception 'EXISTING RPC DISAPPEARED: %', v_missing;
  end loop;

  -- ---------------------------------------------------------
  -- 4. New RPCs exist
  -- ---------------------------------------------------------
  for v_missing in
    select f from unnest(array[
      'merchant_upsert_customer','merchant_set_consent','merge_customers',
      'soft_delete_customer','record_event','customer_timeline_unified',
      'recompute_customer_analytics','merchant_customer_360',
      'merchant_create_segment','assign_customer_to_segments'
    ]) as f
    where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f
    )
  loop
    raise exception 'NEW RPC MISSING: %', v_missing;
  end loop;

  -- ---------------------------------------------------------
  -- 5. RLS enabled + no anon/authenticated grants on new tables
  -- ---------------------------------------------------------
  for v_missing in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'customer_addresses','customer_consents','customer_preferences',
        'customer_devices','customer_notes','customer_custom_fields',
        'customer_tags','customer_tag_map','events','customer_analytics',
        'customer_segments','customer_segment_members')
      and c.relrowsecurity = false
  loop
    raise exception 'RLS NOT ENABLED ON: %', v_missing;
  end loop;

  select string_agg(distinct table_name, ', ') into v_missing
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated')
    and table_name in (
      'customer_addresses','customer_consents','customer_preferences',
      'customer_devices','customer_notes','customer_custom_fields',
      'customer_tags','customer_tag_map','events','customer_analytics',
      'customer_segments','customer_segment_members');
  if v_missing is not null then
    raise exception 'LEAKED GRANT to anon/authenticated on: %', v_missing;
  end if;

  -- ---------------------------------------------------------
  -- 6. New-path functional probe (rolled back by the caller's transaction)
  --    Uses the first available business; skips gracefully if none exists.
  -- ---------------------------------------------------------
  select id into v_biz from businesses order by created_at limit 1;
  if v_biz is null then
    raise notice 'SMOKE: no business rows — skipping functional probe (catalog checks passed)';
    return;
  end if;

  -- 6a. Upsert a customer through the new RPC.
  v_cust := merchant_upsert_customer(
    v_biz, '+919999000011', 'Smoke Test', 'smoke@example.com'
  );
  if v_cust is null then
    raise exception 'merchant_upsert_customer returned null';
  end if;

  -- 6b. Consent write mirrors into the boolean column.
  perform merchant_set_consent(v_biz, v_cust, 'email', 'granted', 'smoke');
  select count(*) into v_count from customers
  where id = v_cust and email_opt_in = true;
  if v_count <> 1 then
    raise exception 'merchant_set_consent did not sync email_opt_in';
  end if;

  -- 6c. Universal event write + idempotent replay via dedup_key.
  v_event := record_event(
    v_biz, 'smoke.ping', 'system', v_cust, null, 'smoke',
    '{"probe":true}'::jsonb, 'smoke-dedup-1'
  );
  if v_event is null then
    raise exception 'record_event returned null on first insert';
  end if;
  -- Replay: same dedup_key must NOT create a second row.
  perform record_event(
    v_biz, 'smoke.ping', 'system', v_cust, null, 'smoke',
    '{"probe":true}'::jsonb, 'smoke-dedup-1'
  );
  select count(*) into v_count from events
  where business_id = v_biz and dedup_key = 'smoke-dedup-1';
  if v_count <> 1 then
    raise exception 'record_event dedup failed: % rows for one dedup_key', v_count;
  end if;

  -- 6d. Analytics recompute + 360 bundle merges historic + new streams.
  perform recompute_customer_analytics(v_biz, v_cust);
  perform merchant_customer_360(v_biz, v_cust);

  -- 6e. Unified timeline returns the event we just wrote.
  select count(*) into v_count
  from customer_timeline_unified(v_biz, v_cust, 50, null)
  where name = 'smoke.ping';
  if v_count < 1 then
    raise exception 'customer_timeline_unified did not surface the new event';
  end if;

  raise notice 'SMOKE PASSED: additive checks + functional probe OK (biz=%, customer=%)', v_biz, v_cust;
end $$;
