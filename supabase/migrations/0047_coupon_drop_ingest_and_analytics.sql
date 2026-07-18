-- =============================================================
-- 0047_coupon_drop_ingest_and_analytics.sql — sales attribution, idempotent
-- coupon redemption, and campaign-level Coupon Drop analytics.
--
-- Supersedes shopify_ingest_order (from 0038) via CREATE OR REPLACE, preserving
-- ALL prior behavior verbatim (customer resolve, header upsert, line-item
-- replace, universal commerce event + dedup, events.order_id backfill, customer
-- analytics rollup). It ADDS discount-code attribution at the end:
--   * resolve each normalized discount code (upper/trim) to (coupon_id,
--     campaign_id), tenant-scoped, preferring the pool then the coupons table;
--   * stamp orders.campaign_id / coupon_id / discount_code (idempotent);
--   * mark the coupon redeemed ONCE (rowcount guard) so re-delivery of
--     orders/updated + orders/paid never double-counts, emitting coupon_redeemed
--     + coupon.redeemed only on the transition.
--
-- Also adds coupon_drop_stats(business, campaign) for the analytics card. All
-- reused event types are already permitted → no CHECK ALTER needed.
-- =============================================================

create or replace function shopify_ingest_order(
  p_business_id uuid,
  p_order       jsonb   -- normalized order shape built by the ingestion service
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id   uuid;
  v_customer   uuid;
  v_phone      text := nullif(trim(coalesce(p_order->>'customer_phone', '')), '');
  v_email      text := nullif(trim(coalesce(p_order->>'customer_email', '')), '');
  v_ext_id     text := nullif(trim(coalesce(p_order->>'shopify_order_id', '')), '');
  v_item       jsonb;
  -- Attribution locals.
  v_dc         jsonb;
  v_code       text;
  v_coupon_id  uuid;
  v_campaign_id uuid;
  v_redeemed   int;
begin
  -- Resolve/attach the customer by phone (falls back to null when absent).
  if v_phone is not null then
    v_customer := merchant_upsert_customer(
      p_business_id, v_phone,
      coalesce(p_order->>'customer_name', 'Customer'),
      v_email, null, null, null, null, null, 'shopify'
    );
  end if;

  -- Upsert the order header.
  insert into orders (
    business_id, customer_id, shopify_order_id, order_number, source,
    financial_status, fulfillment_status, currency,
    subtotal, total_tax, total_discount, total_price,
    customer_phone, customer_email, placed_at, raw
  ) values (
    p_business_id, v_customer, v_ext_id, p_order->>'order_number', 'shopify',
    p_order->>'financial_status', p_order->>'fulfillment_status',
    coalesce(nullif(p_order->>'currency',''), 'INR'),
    (p_order->>'subtotal')::numeric, (p_order->>'total_tax')::numeric,
    (p_order->>'total_discount')::numeric,
    coalesce((p_order->>'total_price')::numeric, 0),
    v_phone, v_email,
    coalesce((p_order->>'placed_at')::timestamptz, now()),
    coalesce(p_order->'raw', '{}'::jsonb)
  )
  on conflict (business_id, shopify_order_id) do update
    set customer_id        = excluded.customer_id,
        financial_status   = excluded.financial_status,
        fulfillment_status = excluded.fulfillment_status,
        total_price        = excluded.total_price,
        raw                = excluded.raw,
        updated_at         = now()
  returning id into v_order_id;

  -- Replace line items (simplest correct re-ingest semantics).
  delete from order_items where order_id = v_order_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb))
  loop
    insert into order_items (
      business_id, order_id, shopify_line_id, shopify_product_id,
      title, sku, quantity, price, total_discount
    ) values (
      p_business_id, v_order_id, v_item->>'shopify_line_id', v_item->>'shopify_product_id',
      v_item->>'title', v_item->>'sku',
      coalesce((v_item->>'quantity')::int, 1),
      coalesce((v_item->>'price')::numeric, 0),
      coalesce((v_item->>'total_discount')::numeric, 0)
    );
  end loop;

  -- Emit the universal commerce event (idempotent per order).
  perform record_event(
    p_business_id, 'order.placed', 'commerce', v_customer, null, 'shopify',
    jsonb_build_object(
      'order_id', v_order_id,
      'shopify_order_id', v_ext_id,
      'total_price', coalesce((p_order->>'total_price')::numeric, 0),
      'currency', coalesce(nullif(p_order->>'currency',''), 'INR')
    ),
    case when v_ext_id is not null then 'shopify:order:' || v_ext_id else null end,
    coalesce((p_order->>'placed_at')::timestamptz, now())
  );

  -- Point the event's reserved order_id at the order for direct joins.
  update events
     set order_id = v_order_id
   where business_id = p_business_id
     and dedup_key = 'shopify:order:' || coalesce(v_ext_id, '')
     and order_id is null;

  -- =========================================================
  -- Coupon Drop attribution: match the order's discount codes to an issued
  -- coupon, stamp the order, and count the redemption exactly once.
  -- =========================================================
  for v_dc in select * from jsonb_array_elements(coalesce(p_order->'discount_codes', '[]'::jsonb))
  loop
    -- discount_codes entries may be strings or {code: ...} objects.
    v_code := upper(trim(coalesce(
      case when jsonb_typeof(v_dc) = 'string' then v_dc #>> '{}' else v_dc->>'code' end,
      '')));
    if v_code = '' then
      continue;
    end if;

    v_coupon_id := null;
    v_campaign_id := null;

    -- Prefer a claimed pool code (unique per campaign), tenant-scoped.
    select p.claimed_by_coupon_id, p.campaign_id
      into v_coupon_id, v_campaign_id
      from campaign_coupon_pool p
     where p.business_id = p_business_id
       and upper(p.code) = v_code
       and p.status = 'claimed'
     limit 1;

    -- Otherwise resolve directly against issued coupons.
    if v_coupon_id is null then
      select c.id, c.campaign_id
        into v_coupon_id, v_campaign_id
        from coupons c
       where c.business_id = p_business_id
         and upper(c.code) = v_code
       limit 1;
    end if;

    if v_coupon_id is null then
      continue;  -- not one of ours (e.g. a merchant's manual discount)
    end if;

    -- Stamp attribution on the order (idempotent on re-ingest).
    update orders
       set campaign_id = coalesce(campaign_id, v_campaign_id),
           coupon_id   = coalesce(coupon_id, v_coupon_id),
           discount_code = coalesce(discount_code, v_code),
           updated_at  = now()
     where id = v_order_id;

    -- Mark redeemed exactly once. rowcount guard = idempotent under redelivery.
    update coupons
       set status = 'redeemed',
           redeemed_at = coalesce(redeemed_at, now())
     where id = v_coupon_id
       and business_id = p_business_id
       and status <> 'redeemed';
    get diagnostics v_redeemed = row_count;

    if v_redeemed = 1 then
      perform record_customer_event(
        p_business_id, v_campaign_id,
        (select customer_id from coupons where id = v_coupon_id),
        'coupon_redeemed', null, v_coupon_id,
        jsonb_build_object('code', v_code, 'order_id', v_order_id,
                           'shopify_order_id', v_ext_id,
                           'total_price', coalesce((p_order->>'total_price')::numeric, 0)));
      perform record_campaign_event(
        p_business_id, v_campaign_id, 'system', null,
        'coupon.redeemed',
        jsonb_build_object('couponCode', v_code, 'couponId', v_coupon_id,
                           'orderId', v_order_id, 'shopifyOrderId', v_ext_id,
                           'totalPrice', coalesce((p_order->>'total_price')::numeric, 0),
                           'currency', coalesce(nullif(p_order->>'currency',''), 'INR')),
        null, null);
    end if;
  end loop;

  -- Refresh the customer's analytics rollup (best effort inside the txn).
  if v_customer is not null then
    perform recompute_customer_analytics(p_business_id, v_customer);
  end if;

  return v_order_id;
end $$;

revoke execute on function shopify_ingest_order(uuid, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- coupon_drop_stats — campaign-level Coupon Drop analytics for the merchant
-- dashboard. Tenant-scoped by (business_id, campaign_id).
-- =============================================================
create or replace function coupon_drop_stats(
  p_business_id uuid,
  p_campaign_id uuid
) returns table (
  codes_minted           int,
  codes_available        int,
  codes_claimed          int,
  codes_redeemed         int,
  fallback_issued        int,
  orders_attributed      int,
  gross_sales_attributed numeric,
  avg_order_value        numeric,
  currency               text
)
language sql stable security definer set search_path = public as $$
  select
    (select coalesce(count(*), 0)::int
       from campaign_coupon_pool p
      where p.business_id = p_business_id and p.campaign_id = p_campaign_id),
    (select coalesce(sum((p.status = 'available')::int), 0)::int
       from campaign_coupon_pool p
      where p.business_id = p_business_id and p.campaign_id = p_campaign_id),
    (select coalesce(sum((p.status = 'claimed')::int), 0)::int
       from campaign_coupon_pool p
      where p.business_id = p_business_id and p.campaign_id = p_campaign_id),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id and c.campaign_id = p_campaign_id
        and c.status = 'redeemed'),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id and c.campaign_id = p_campaign_id
        and c.source = 'internal_fallback'),
    (select coalesce(count(*), 0)::int
       from orders o
      where o.business_id = p_business_id and o.campaign_id = p_campaign_id),
    (select coalesce(sum(o.total_price), 0)::numeric
       from orders o
      where o.business_id = p_business_id and o.campaign_id = p_campaign_id),
    (select coalesce(avg(o.total_price), 0)::numeric
       from orders o
      where o.business_id = p_business_id and o.campaign_id = p_campaign_id),
    coalesce(
      (select cfg.currency from campaign_coupon_configs cfg
        where cfg.business_id = p_business_id and cfg.campaign_id = p_campaign_id),
      'INR');
$$;

revoke execute on function coupon_drop_stats(uuid, uuid)
  from public, anon, authenticated;
