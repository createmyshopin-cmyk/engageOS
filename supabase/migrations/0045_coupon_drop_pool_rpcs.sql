-- =============================================================
-- 0045_coupon_drop_pool_rpcs.sql — Node-callable lifecycle RPCs for the
-- Coupon Drop pool. Every function takes an explicit p_business_id and joins
-- through campaigns to enforce tenant ownership IN SQL, so tenant safety never
-- depends on the calling code. All are SECURITY DEFINER with search_path pinned
-- and execute revoked from public/anon/authenticated (service-role only).
--
-- These are invoked exclusively by the server-side orchestrator
-- (src/lib/shopify/coupon-drop-orchestrator.ts) via the service-role client.
-- =============================================================

-- =============================================================
-- 1. coupon_config_upsert — create/update the merchant's discount rules for a
--    coupon_drop campaign. Ownership: the campaign must belong to p_business_id.
-- =============================================================
create or replace function coupon_config_upsert(
  p_business_id               uuid,
  p_campaign_id               uuid,
  p_win_mode                  text,
  p_discount_type             text,
  p_discount_value            numeric,
  p_minimum_subtotal          numeric,
  p_usage_limit               int,
  p_applies_once_per_customer boolean,
  p_expiry_days               int,
  p_scope_product_ids         text[],
  p_scope_collection_ids      text[],
  p_currency                  text,
  p_pool_target               int,
  p_pool_low_watermark        int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Ownership guard: campaign must exist under this business.
  if not exists (
    select 1 from campaigns c
     where c.id = p_campaign_id and c.business_id = p_business_id
  ) then
    raise exception 'Campaign not found or access denied';
  end if;

  insert into campaign_coupon_configs (
    campaign_id, business_id, win_mode, discount_type, discount_value,
    minimum_subtotal, usage_limit, applies_once_per_customer, expiry_days,
    scope_product_ids, scope_collection_ids, currency,
    pool_target, pool_low_watermark
  ) values (
    p_campaign_id, p_business_id,
    coalesce(nullif(trim(p_win_mode), ''), 'weighted'),
    p_discount_type, p_discount_value,
    p_minimum_subtotal, p_usage_limit,
    coalesce(p_applies_once_per_customer, false), p_expiry_days,
    coalesce(p_scope_product_ids, '{}'), coalesce(p_scope_collection_ids, '{}'),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    coalesce(p_pool_target, 500), coalesce(p_pool_low_watermark, 100)
  )
  on conflict (campaign_id) do update
    set win_mode                  = excluded.win_mode,
        discount_type             = excluded.discount_type,
        discount_value            = excluded.discount_value,
        minimum_subtotal          = excluded.minimum_subtotal,
        usage_limit               = excluded.usage_limit,
        applies_once_per_customer = excluded.applies_once_per_customer,
        expiry_days               = excluded.expiry_days,
        scope_product_ids         = excluded.scope_product_ids,
        scope_collection_ids      = excluded.scope_collection_ids,
        currency                  = excluded.currency,
        pool_target               = excluded.pool_target,
        pool_low_watermark        = excluded.pool_low_watermark,
        updated_at                = now();
end $$;

revoke execute on function coupon_config_upsert(
  uuid, uuid, text, text, numeric, numeric, int, boolean, int, text[], text[], text, int, int
) from public, anon, authenticated;

-- =============================================================
-- 2. coupon_config_set_parent — record the created Shopify parent discount id
--    and move the pool into a lifecycle state (typically 'minting').
-- =============================================================
create or replace function coupon_config_set_parent(
  p_business_id   uuid,
  p_campaign_id   uuid,
  p_parent_gid    text,
  p_pool_status   text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update campaign_coupon_configs cfg
     set shopify_parent_discount_id = p_parent_gid,
         pool_status = coalesce(nullif(trim(p_pool_status), ''), pool_status),
         pool_last_error = null,
         updated_at = now()
   where cfg.campaign_id = p_campaign_id
     and cfg.business_id = p_business_id;
  if not found then
    raise exception 'Coupon config not found or access denied';
  end if;
end $$;

revoke execute on function coupon_config_set_parent(uuid, uuid, text, text)
  from public, anon, authenticated;

-- =============================================================
-- 3. coupon_pool_add_codes — bulk-insert freshly minted Shopify codes.
--    p_codes is a JSON array of {code, shopify_redeem_code_id}. Idempotent per
--    (campaign_id, code) so re-runs / retries never duplicate. Returns the
--    number of rows actually inserted.
-- =============================================================
create or replace function coupon_pool_add_codes(
  p_business_id uuid,
  p_campaign_id uuid,
  p_parent_gid  text,
  p_codes       jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_inserted int := 0;
begin
  if not exists (
    select 1 from campaigns c
     where c.id = p_campaign_id and c.business_id = p_business_id
  ) then
    raise exception 'Campaign not found or access denied';
  end if;

  with ins as (
    insert into campaign_coupon_pool (
      business_id, campaign_id, shopify_parent_discount_id, code, shopify_redeem_code_id
    )
    select
      p_business_id, p_campaign_id, p_parent_gid,
      upper(trim(elem->>'code')),
      nullif(trim(coalesce(elem->>'shopify_redeem_code_id', '')), '')
    from jsonb_array_elements(coalesce(p_codes, '[]'::jsonb)) as elem
    where nullif(trim(coalesce(elem->>'code', '')), '') is not null
    on conflict (campaign_id, code) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end $$;

revoke execute on function coupon_pool_add_codes(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- 4. coupon_pool_counts — current pool health for a campaign, used by the
--    orchestrator to decide top-ups and by analytics.
-- =============================================================
create or replace function coupon_pool_counts(
  p_business_id uuid,
  p_campaign_id uuid
) returns table (
  available          int,
  claimed            int,
  total              int,
  pool_target        int,
  pool_low_watermark int,
  pool_status        text
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum((p.status = 'available')::int), 0)::int as available,
    coalesce(sum((p.status = 'claimed')::int), 0)::int   as claimed,
    coalesce(count(p.id), 0)::int                        as total,
    cfg.pool_target,
    cfg.pool_low_watermark,
    cfg.pool_status
  from campaign_coupon_configs cfg
  left join campaign_coupon_pool p on p.campaign_id = cfg.campaign_id
  where cfg.campaign_id = p_campaign_id
    and cfg.business_id = p_business_id
  group by cfg.pool_target, cfg.pool_low_watermark, cfg.pool_status;
$$;

revoke execute on function coupon_pool_counts(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- 5. coupon_pool_set_status — move the pool into a lifecycle state, optionally
--    recording an error message (e.g. missing write_discounts scope).
-- =============================================================
create or replace function coupon_pool_set_status(
  p_business_id uuid,
  p_campaign_id uuid,
  p_pool_status text,
  p_error       text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update campaign_coupon_configs cfg
     set pool_status = coalesce(nullif(trim(p_pool_status), ''), pool_status),
         pool_last_error = p_error,
         updated_at = now()
   where cfg.campaign_id = p_campaign_id
     and cfg.business_id = p_business_id;
  if not found then
    raise exception 'Coupon config not found or access denied';
  end if;
end $$;

revoke execute on function coupon_pool_set_status(uuid, uuid, text, text)
  from public, anon, authenticated;

-- =============================================================
-- 6. coupon_drop_campaigns_for_topup — list active coupon_drop campaigns whose
--    available pool has fallen at/below their low watermark. Drives the daily
--    cron sweep. Returns (business_id, campaign_id) only — the orchestrator
--    re-resolves the Shopify client per business.
-- =============================================================
create or replace function coupon_drop_campaigns_for_topup()
returns table (business_id uuid, campaign_id uuid)
language sql stable security definer set search_path = public as $$
  select cfg.business_id, cfg.campaign_id
  from campaign_coupon_configs cfg
  join campaigns c on c.id = cfg.campaign_id
  where c.campaign_type = 'coupon_drop'
    and c.status = 'active'
    and cfg.pool_status in ('ready','error')
    and cfg.shopify_parent_discount_id is not null
    and (
      select coalesce(sum((p.status = 'available')::int), 0)
      from campaign_coupon_pool p
      where p.campaign_id = cfg.campaign_id
    ) <= cfg.pool_low_watermark;
$$;

revoke execute on function coupon_drop_campaigns_for_topup()
  from public, anon, authenticated;
