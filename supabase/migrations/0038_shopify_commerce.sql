-- =============================================================
-- 0038_shopify_commerce.sql — Commerce domain (Shopify) + ingestion
--
-- Ships the deferred Task-1 commerce tables so the CDP commerce loop becomes
-- real: shops, products, orders, order line items, and an idempotency log for
-- Shopify webhooks. Ingestion lands every order as a universal `events` row
-- (category 'commerce'), wiring the reserved events.order_id FK.
--
-- STRICTLY ADDITIVE: no existing table/RPC/trigger is modified. New tables are
-- RLS-locked and execute is revoked on every RPC, matching 0034–0037.
--
-- Tenancy: every table carries business_id NN FK cascade. Shopify's own ids
-- (shop domain, product/order/customer gid) are stored as external refs and are
-- unique PER BUSINESS, never globally — two merchants may connect the same app.
-- =============================================================

-- ---------- shopify_shops: one connected store per business ----------
create table if not exists shopify_shops (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  shop_domain       text not null,                 -- e.g. 'acme.myshopify.com'
  access_token_enc  text,                          -- AES-256-GCM ciphertext (app-layer), never plaintext
  scopes            text,
  webhook_secret_enc text,                          -- per-shop HMAC secret (encrypted); null → use app secret
  status            text not null default 'active' check (status in ('active','paused','revoked')),
  installed_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id),                            -- one store per tenant (Phase 1)
  unique (business_id, shop_domain)
);

-- ---------- shopify_products: catalog mirror ----------
create table if not exists shopify_products (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  shopify_product_id text not null,                -- Shopify gid/id
  title             text,
  handle            text,
  product_type      text,
  vendor            text,
  status            text,
  price             numeric(12,2),
  image_url         text,
  tags              text[],
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, shopify_product_id)
);

-- ---------- orders: canonical order header ----------
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  customer_id       uuid references customers(id) on delete set null,
  shopify_order_id  text,                           -- external ref; null for non-Shopify (POS later)
  order_number      text,
  source            text not null default 'shopify',
  financial_status  text,                           -- 'paid' | 'pending' | 'refunded' | ...
  fulfillment_status text,
  currency          text not null default 'INR',
  subtotal          numeric(14,2),
  total_tax         numeric(14,2),
  total_discount    numeric(14,2),
  total_price       numeric(14,2) not null default 0,
  customer_phone    text,                           -- as received, for matching to customers
  customer_email    text,
  placed_at         timestamptz not null default now(),
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, shopify_order_id)
);

-- ---------- order_items: line items ----------
create table if not exists order_items (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  order_id          uuid not null references orders(id) on delete cascade,
  shopify_line_id   text,
  product_id        uuid references shopify_products(id) on delete set null,
  shopify_product_id text,
  title             text,
  sku               text,
  quantity          int not null default 1,
  price             numeric(12,2) not null default 0,
  total_discount    numeric(12,2) not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------- shopify_webhook_log: idempotency + audit for inbound webhooks ----
-- One row per (business, topic, webhook_id). A redelivery of the same
-- X-Shopify-Webhook-Id is a conflict-do-nothing no-op, making processing
-- idempotent and retry-safe even before the payload is parsed.
create table if not exists shopify_webhook_log (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  webhook_id        text not null,                  -- X-Shopify-Webhook-Id header
  topic             text not null,                  -- X-Shopify-Topic (e.g. 'orders/create')
  shop_domain       text,
  status            text not null default 'received' check (status in ('received','processed','failed')),
  error             text,
  payload           jsonb not null default '{}'::jsonb,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (business_id, webhook_id, topic)
);

-- Now that orders exists, wire the reserved events.order_id → orders(id).
-- Guarded so re-running the migration does not error if already added.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_order_id_fkey'
  ) then
    alter table events
      add constraint events_order_id_fkey
      foreign key (order_id) references orders(id) on delete set null;
  end if;
end $$;

-- ---------- Indexes ----------
create index if not exists orders_business_time_idx on orders (business_id, placed_at desc);
create index if not exists orders_customer_time_idx on orders (customer_id, placed_at desc);
create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_business_idx on order_items (business_id);
create index if not exists shopify_products_business_idx on shopify_products (business_id);
create index if not exists shopify_webhook_log_business_idx
  on shopify_webhook_log (business_id, received_at desc);

-- ---------- updated_at triggers (reuse set_updated_at from 0034) ----------
drop trigger if exists shopify_shops_set_updated_at on shopify_shops;
create trigger shopify_shops_set_updated_at
  before update on shopify_shops for each row execute function set_updated_at();
drop trigger if exists shopify_products_set_updated_at on shopify_products;
create trigger shopify_products_set_updated_at
  before update on shopify_products for each row execute function set_updated_at();
drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders for each row execute function set_updated_at();

-- ---------- Lockdown: RLS on + revoke from anon/authenticated ----------
alter table shopify_shops       enable row level security;
alter table shopify_products    enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table shopify_webhook_log enable row level security;

revoke all on shopify_shops, shopify_products, orders, order_items, shopify_webhook_log
  from anon, authenticated;

-- =============================================================
-- RPC: shopify_log_webhook — claim a webhook id idempotently.
-- Returns true if this is the FIRST time we've seen (business, webhook_id,
-- topic) — i.e. the caller should process it. Returns false on a redelivery.
-- =============================================================
create or replace function shopify_log_webhook(
  p_business_id uuid,
  p_webhook_id  text,
  p_topic       text,
  p_shop_domain text,
  p_payload     jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_inserted boolean := false;
begin
  insert into shopify_webhook_log (business_id, webhook_id, topic, shop_domain, payload)
  values (p_business_id, p_webhook_id, p_topic, p_shop_domain, coalesce(p_payload, '{}'::jsonb))
  on conflict (business_id, webhook_id, topic) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;  -- true == freshly claimed, safe to process
end $$;

revoke execute on function shopify_log_webhook(uuid, text, text, text, jsonb)
  from public, anon, authenticated;

-- =============================================================
-- RPC: shopify_ingest_order — upsert an order (+items) and emit a commerce
-- event. Matches/creates the customer by phone (the CDP identity key) so the
-- order joins the customer's 360. Idempotent on (business_id, shopify_order_id):
-- a re-ingest updates the header and replaces line items, and dedups the
-- universal event via events.dedup_key = 'shopify:order:<id>'.
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

  -- Refresh the customer's analytics rollup (best effort inside the txn).
  if v_customer is not null then
    perform recompute_customer_analytics(p_business_id, v_customer);
  end if;

  return v_order_id;
end $$;

revoke execute on function shopify_ingest_order(uuid, jsonb)
  from public, anon, authenticated;
