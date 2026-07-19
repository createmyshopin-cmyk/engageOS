-- =============================================================
-- EngageOS — Migration 0070: Loyalty points ledger + wallet
--
-- Append-only points_transactions, customer_wallet read model,
-- points_rules defaults, earn hooks (Shopify order, signup,
-- first purchase, campaign wallet_points prize).
--
-- STRICTLY ADDITIVE. Service-role only.
-- =============================================================

-- ── points_rules ─────────────────────────────────────────────
create table if not exists points_rules (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id) on delete cascade,
  rule_type       text not null,
  points_per_unit numeric(10,2),
  fixed_points    int,
  multiplier      numeric(5,2) not null default 1,
  active          boolean not null default true,
  config          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, rule_type)
);

create index if not exists points_rules_business_idx
  on points_rules (business_id);

drop trigger if exists points_rules_updated_at on points_rules;
create trigger points_rules_updated_at
  before update on points_rules
  for each row execute function set_updated_at();

alter table points_rules enable row level security;
revoke all on points_rules from anon, authenticated;

-- ── points_transactions (append-only ledger) ─────────────────
create table if not exists points_transactions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  txn_type     text not null check (txn_type in ('earn', 'redeem', 'expire', 'adjust')),
  source       text not null,
  delta        int not null,
  balance_after int not null,
  campaign_id  uuid references campaigns(id) on delete set null,
  order_id     uuid references orders(id) on delete set null,
  play_id      uuid references plays(id) on delete set null,
  note         text,
  dedup_key    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  created_by   text not null default 'system'
);

create index if not exists points_transactions_customer_idx
  on points_transactions (business_id, customer_id, created_at desc);
create unique index if not exists points_transactions_dedup_idx
  on points_transactions (business_id, dedup_key)
  where dedup_key is not null;

alter table points_transactions enable row level security;
revoke all on points_transactions from anon, authenticated;

-- ── customer_wallet (read-model snapshot) ────────────────────
create table if not exists customer_wallet (
  customer_id       uuid primary key references customers(id) on delete cascade,
  business_id       uuid not null references businesses(id) on delete cascade,
  available_points  int not null default 0,
  lifetime_points   int not null default 0,
  redeemed_points   int not null default 0,
  expiring_soon     int not null default 0,
  updated_at        timestamptz not null default now()
);

create index if not exists customer_wallet_business_idx
  on customer_wallet (business_id, available_points desc);

drop trigger if exists customer_wallet_updated_at on customer_wallet;
create trigger customer_wallet_updated_at
  before update on customer_wallet
  for each row execute function set_updated_at();

alter table customer_wallet enable row level security;
revoke all on customer_wallet from anon, authenticated;

-- ── ensure_default_points_rules ──────────────────────────────
create or replace function ensure_default_points_rules(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into points_rules (business_id, rule_type, points_per_unit, fixed_points, active)
  values
    (p_business_id, 'purchase',        10, null, true),
    (p_business_id, 'signup',        null, 25, true),
    (p_business_id, 'first_purchase', null, 100, true),
    (p_business_id, 'birthday',      null, 50, true),
    (p_business_id, 'referral',      null, 100, true),
    (p_business_id, 'review',        null, 30, true),
    (p_business_id, 'campaign_play', null, 20, true)
  on conflict (business_id, rule_type) do nothing;
end $$;

revoke execute on function ensure_default_points_rules(uuid)
  from public, anon, authenticated;

-- ── loyalty_rule_fixed_points ────────────────────────────────
create or replace function loyalty_rule_fixed_points(
  p_business_id uuid,
  p_rule_type   text,
  p_fallback    int
) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (r.fixed_points * r.multiplier)::int
       from points_rules r
      where r.business_id = p_business_id
        and r.rule_type = p_rule_type
        and r.active = true
      limit 1),
    p_fallback
  );
$$;

revoke execute on function loyalty_rule_fixed_points(uuid, text, int)
  from public, anon, authenticated;

-- ── loyalty_calc_purchase_points ─────────────────────────────
create or replace function loyalty_calc_purchase_points(
  p_business_id uuid,
  p_amount      numeric
) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_per_100 numeric(10,2) := 10;
  v_mult    numeric(5,2) := 1;
begin
  perform ensure_default_points_rules(p_business_id);

  select coalesce(r.points_per_unit, 10), coalesce(r.multiplier, 1)
    into v_per_100, v_mult
    from points_rules r
   where r.business_id = p_business_id
     and r.rule_type = 'purchase'
     and r.active = true
   limit 1;

  if coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;

  return greatest(0, floor(p_amount / 100) * v_per_100 * v_mult)::int;
end $$;

revoke execute on function loyalty_calc_purchase_points(uuid, numeric)
  from public, anon, authenticated;

-- ── record_points_transaction ────────────────────────────────
create or replace function record_points_transaction(
  p_business_id uuid,
  p_customer_id uuid,
  p_txn_type    text,
  p_source      text,
  p_delta       int,
  p_dedup_key   text default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_campaign_id uuid default null,
  p_order_id    uuid default null,
  p_play_id     uuid default null,
  p_note        text default null,
  p_created_by  text default 'system'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id            uuid;
  v_key           text := nullif(trim(coalesce(p_dedup_key, '')), '');
  v_existing      uuid;
  v_available     int := 0;
  v_lifetime      int := 0;
  v_redeemed      int := 0;
  v_balance_after int;
  v_event_name    text;
begin
  if p_delta = 0 then
    return null;
  end if;

  if not exists (
    select 1 from customers
     where id = p_customer_id and business_id = p_business_id and deleted_at is null
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  perform ensure_default_points_rules(p_business_id);

  if v_key is not null then
    select id into v_existing
      from points_transactions
     where business_id = p_business_id and dedup_key = v_key
     limit 1;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select available_points, lifetime_points, redeemed_points
    into v_available, v_lifetime, v_redeemed
    from customer_wallet
   where customer_id = p_customer_id and business_id = p_business_id
   for update;

  if not found then
    v_available := 0;
    v_lifetime := 0;
    v_redeemed := 0;
  end if;

  v_balance_after := v_available + p_delta;
  if v_balance_after < 0 then
    raise exception 'insufficient points: available %, delta %', v_available, p_delta;
  end if;

  insert into points_transactions (
    business_id, customer_id, txn_type, source, delta, balance_after,
    campaign_id, order_id, play_id, note, dedup_key, metadata, created_by
  ) values (
    p_business_id, p_customer_id, p_txn_type, p_source, p_delta, v_balance_after,
    p_campaign_id, p_order_id, p_play_id, p_note, v_key,
    coalesce(p_metadata, '{}'::jsonb), coalesce(nullif(trim(p_created_by), ''), 'system')
  )
  returning id into v_id;

  insert into customer_wallet (
    customer_id, business_id, available_points, lifetime_points, redeemed_points, updated_at
  ) values (
    p_customer_id, p_business_id, v_balance_after,
    v_lifetime + case when p_txn_type = 'earn' and p_delta > 0 then p_delta else 0 end,
    v_redeemed + case when p_txn_type in ('redeem', 'expire') then abs(p_delta) else 0 end,
    now()
  )
  on conflict (customer_id) do update set
    available_points = excluded.available_points,
    lifetime_points  = customer_wallet.lifetime_points
                         + case when p_txn_type = 'earn' and p_delta > 0 then p_delta else 0 end,
    redeemed_points  = customer_wallet.redeemed_points
                         + case when p_txn_type in ('redeem', 'expire') then abs(p_delta) else 0 end,
    updated_at       = now();

  v_event_name := case p_txn_type
    when 'earn'   then 'loyalty.points.earned'
    when 'redeem' then 'loyalty.points.redeemed'
    when 'expire' then 'loyalty.points.expired'
    else 'loyalty.points.adjusted'
  end;

  perform record_event(
    p_business_id, v_event_name, 'loyalty', p_customer_id, p_campaign_id, p_source,
    jsonb_build_object(
      'transaction_id', v_id,
      'txn_type', p_txn_type,
      'source', p_source,
      'delta', p_delta,
      'balance_after', v_balance_after,
      'order_id', p_order_id,
      'play_id', p_play_id,
      'note', p_note
    ) || coalesce(p_metadata, '{}'::jsonb),
    case when v_key is not null then 'event:' || v_key else null end,
    now()
  );

  return v_id;
end $$;

revoke execute on function record_points_transaction(
  uuid, uuid, text, text, int, text, jsonb, uuid, uuid, uuid, text, text
) from public, anon, authenticated;

-- ── loyalty_award_order_points ───────────────────────────────
create or replace function loyalty_award_order_points(
  p_business_id       uuid,
  p_customer_id       uuid,
  p_order_id          uuid,
  p_shopify_order_id  text,
  p_total_price       numeric,
  p_financial_status  text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_purchase_pts int;
  v_first_pts    int;
  v_paid_count   int;
begin
  if p_financial_status not in ('paid', 'partially_paid') then
    return;
  end if;

  v_purchase_pts := loyalty_calc_purchase_points(p_business_id, p_total_price);
  if v_purchase_pts > 0 then
    perform record_points_transaction(
      p_business_id, p_customer_id, 'earn', 'purchase', v_purchase_pts,
      case when p_shopify_order_id is not null
           then 'loyalty:earn:order:' || p_shopify_order_id else null end,
      jsonb_build_object('order_id', p_order_id, 'total_price', p_total_price),
      null, p_order_id, null, null, 'shopify'
    );
  end if;

  select count(*)::int into v_paid_count
    from orders
   where business_id = p_business_id
     and customer_id = p_customer_id
     and financial_status in ('paid', 'partially_paid');

  if v_paid_count = 1 then
    v_first_pts := loyalty_rule_fixed_points(p_business_id, 'first_purchase', 100);
    if v_first_pts > 0 then
      perform record_points_transaction(
        p_business_id, p_customer_id, 'earn', 'first_purchase', v_first_pts,
        'loyalty:earn:first_order:' || p_order_id::text,
        jsonb_build_object('order_id', p_order_id),
        null, p_order_id, null, null, 'shopify'
      );
    end if;
  end if;
end $$;

revoke execute on function loyalty_award_order_points(uuid, uuid, uuid, text, numeric, text)
  from public, anon, authenticated;

-- ── loyalty_award_signup_points ──────────────────────────────
create or replace function loyalty_award_signup_points(
  p_business_id uuid,
  p_customer_id uuid,
  p_dedup_key   text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pts int;
begin
  v_pts := loyalty_rule_fixed_points(p_business_id, 'signup', 25);
  if v_pts <= 0 then return; end if;

  perform record_points_transaction(
    p_business_id, p_customer_id, 'earn', 'signup', v_pts,
    p_dedup_key,
    '{}'::jsonb, null, null, null, null, 'system'
  );
end $$;

revoke execute on function loyalty_award_signup_points(uuid, uuid, text)
  from public, anon, authenticated;

-- ── loyalty_award_campaign_play_points ───────────────────────
create or replace function loyalty_award_campaign_play_points(
  p_business_id uuid,
  p_customer_id uuid,
  p_campaign_id uuid,
  p_play_id     uuid,
  p_prize_type  text,
  p_prize_value numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pts int;
begin
  if p_prize_type <> 'wallet_points' then
    return;
  end if;

  v_pts := greatest(0, coalesce(p_prize_value, 0)::int);
  if v_pts <= 0 then
    v_pts := loyalty_rule_fixed_points(p_business_id, 'campaign_play', 20);
  end if;

  if v_pts <= 0 then return; end if;

  perform record_points_transaction(
    p_business_id, p_customer_id, 'earn', 'campaign_play', v_pts,
    'loyalty:earn:play:' || p_play_id::text,
    jsonb_build_object('prize_type', p_prize_type, 'prize_value', p_prize_value),
    p_campaign_id, null, p_play_id, null, 'play_engine'
  );
end $$;

revoke execute on function loyalty_award_campaign_play_points(uuid, uuid, uuid, uuid, text, numeric)
  from public, anon, authenticated;

-- ── get_customer_wallet ──────────────────────────────────────
create or replace function get_customer_wallet(
  p_business_id uuid,
  p_customer_id uuid
) returns table (
  customer_id      uuid,
  full_name        text,
  phone            text,
  available_points int,
  lifetime_points  int,
  redeemed_points  int,
  expiring_soon    int,
  updated_at       timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    coalesce(c.full_name, c.name),
    c.phone,
    coalesce(w.available_points, 0),
    coalesce(w.lifetime_points, 0),
    coalesce(w.redeemed_points, 0),
    coalesce(w.expiring_soon, 0),
    w.updated_at
  from customers c
  left join customer_wallet w
    on w.customer_id = c.id and w.business_id = p_business_id
  where c.id = p_customer_id
    and c.business_id = p_business_id
    and c.deleted_at is null;
$$;

revoke execute on function get_customer_wallet(uuid, uuid)
  from public, anon, authenticated;

-- ── get_points_history ───────────────────────────────────────
create or replace function get_points_history(
  p_business_id uuid,
  p_customer_id uuid,
  p_limit       int default 50,
  p_offset      int default 0
) returns table (
  id            uuid,
  txn_type      text,
  source        text,
  delta         int,
  balance_after int,
  note          text,
  campaign_id   uuid,
  order_id      uuid,
  play_id       uuid,
  metadata      jsonb,
  created_at    timestamptz,
  created_by    text
)
language sql stable security definer set search_path = public as $$
  select
    t.id, t.txn_type, t.source, t.delta, t.balance_after, t.note,
    t.campaign_id, t.order_id, t.play_id, t.metadata, t.created_at, t.created_by
  from points_transactions t
  where t.business_id = p_business_id
    and t.customer_id = p_customer_id
  order by t.created_at desc, t.id desc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
$$;

revoke execute on function get_points_history(uuid, uuid, int, int)
  from public, anon, authenticated;

-- ── loyalty_overview — real points totals ────────────────────
create or replace function loyalty_overview(p_business_id uuid)
returns table (
  total_loyalty_members  bigint,
  active_members         bigint,
  total_points_issued    numeric,
  total_points_redeemed  numeric,
  reward_redemption_rate numeric,
  gold_count             bigint,
  silver_count           bigint,
  bronze_count           bigint,
  member_count           bigint,
  repeat_purchase_rate   numeric,
  loyalty_revenue        numeric,
  paying_customers       bigint,
  avg_customer_spend     numeric,
  top_customer_spend     numeric
)
language sql stable security definer set search_path = public as $$
  with base as (
    select
      a.total_orders,
      a.total_spend,
      a.total_wins,
      a.total_redemptions,
      a.recency_days,
      a.last_order_at
    from customer_analytics a
    join customers c on c.id = a.customer_id
    where a.business_id = p_business_id
      and c.business_id = p_business_id
      and c.deleted_at is null
      and (
        a.total_spend > 0
        or a.total_plays > 0
        or a.total_redemptions > 0
        or a.last_seen_at is not null
      )
  ),
  agg as (
    select
      count(*)::bigint as members,
      count(*) filter (
        where coalesce(recency_days, 9999) <= 90
           or last_order_at >= now() - interval '90 days'
      )::bigint as active,
      coalesce(sum(total_redemptions), 0)::bigint as redemptions,
      coalesce(sum(total_wins), 0)::bigint as wins,
      count(*) filter (where total_spend >= 50000)::bigint as gold,
      count(*) filter (where total_spend >= 20000 and total_spend < 50000)::bigint as silver,
      count(*) filter (where total_spend >= 5000 and total_spend < 20000)::bigint as bronze,
      count(*) filter (where total_spend > 0 and total_spend < 5000)::bigint as member,
      count(*) filter (where total_orders >= 2)::bigint as repeat_buyers,
      count(*) filter (where total_spend > 0)::bigint as paying,
      coalesce(sum(total_spend), 0)::numeric as revenue,
      coalesce(max(total_spend), 0)::numeric as top_spend
    from base
  ),
  pts as (
    select
      coalesce(sum(delta) filter (where txn_type = 'earn' and delta > 0), 0)::numeric as issued,
      coalesce(sum(abs(delta)) filter (where txn_type in ('redeem', 'expire')), 0)::numeric as redeemed
    from points_transactions
    where business_id = p_business_id
  )
  select
    members,
    active,
    pts.issued,
    pts.redeemed,
    case when wins > 0
         then round((redemptions::numeric / wins::numeric) * 100, 1)
         else 0 end,
    gold, silver, bronze, member,
    case when paying > 0
         then round((repeat_buyers::numeric / paying::numeric) * 100, 1)
         else 0 end,
    revenue,
    paying,
    case when paying > 0 then round(revenue / paying, 2) else 0 end,
    top_spend
  from agg, pts;
$$;

revoke execute on function loyalty_overview(uuid)
  from public, anon, authenticated;

-- ── shopify_ingest_order — award points on paid orders ───────
create or replace function shopify_ingest_order(
  p_business_id uuid,
  p_order       jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order_id   uuid;
  v_customer   uuid;
  v_phone      text := nullif(trim(coalesce(p_order->>'customer_phone', '')), '');
  v_email      text := nullif(trim(coalesce(p_order->>'customer_email', '')), '');
  v_ext_id     text := nullif(trim(coalesce(p_order->>'shopify_order_id', '')), '');
  v_item       jsonb;
  v_dc         jsonb;
  v_code       text;
  v_coupon_id  uuid;
  v_campaign_id uuid;
  v_redeemed   int;
begin
  if v_phone is not null then
    v_customer := merchant_upsert_customer(
      p_business_id, v_phone,
      coalesce(p_order->>'customer_name', 'Customer'),
      v_email, null, null, null, null, null, 'shopify'
    );
  end if;

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

  update events
     set order_id = v_order_id
   where business_id = p_business_id
     and dedup_key = 'shopify:order:' || coalesce(v_ext_id, '')
     and order_id is null;

  for v_dc in select * from jsonb_array_elements(coalesce(p_order->'discount_codes', '[]'::jsonb))
  loop
    v_code := upper(trim(coalesce(
      case when jsonb_typeof(v_dc) = 'string' then v_dc #>> '{}' else v_dc->>'code' end,
      '')));
    if v_code = '' then continue; end if;

    v_coupon_id := null;
    v_campaign_id := null;

    select p.claimed_by_coupon_id, p.campaign_id
      into v_coupon_id, v_campaign_id
      from campaign_coupon_pool p
     where p.business_id = p_business_id
       and upper(p.code) = v_code
       and p.status = 'claimed'
     limit 1;

    if v_coupon_id is null then
      select c.id, c.campaign_id
        into v_coupon_id, v_campaign_id
        from coupons c
       where c.business_id = p_business_id
         and upper(c.code) = v_code
       limit 1;
    end if;

    if v_coupon_id is null then continue; end if;

    update orders
       set campaign_id = coalesce(campaign_id, v_campaign_id),
           coupon_id   = coalesce(coupon_id, v_coupon_id),
           discount_code = coalesce(discount_code, v_code),
           updated_at  = now()
     where id = v_order_id;

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

  if v_customer is not null then
    perform loyalty_award_order_points(
      p_business_id, v_customer, v_order_id, v_ext_id,
      coalesce((p_order->>'total_price')::numeric, 0),
      p_order->>'financial_status'
    );
    perform recompute_customer_analytics(p_business_id, v_customer);
  end if;

  return v_order_id;
end $$;

revoke execute on function shopify_ingest_order(uuid, jsonb)
  from public, anon, authenticated;

-- ── play_campaign — signup + wallet_points earn ──────────────
create or replace function play_campaign(
  p_merchant_slug text,
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text,
  p_source text default 'direct',
  p_device_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_business businesses%rowtype;
  v_config campaign_coupon_configs%rowtype;
  v_has_config boolean := false;
  v_customer_id uuid;
  v_is_new_customer boolean := false;
  v_prior_plays int;
  v_play_count int;
  v_prize prizes%rowtype;
  v_prize_id uuid;
  v_won boolean := false;
  v_play_id uuid;
  v_coupon_id uuid;
  v_code text;
  v_expires timestamptz;
  v_real_remaining int;
  v_source text := coalesce(nullif(trim(p_source), ''), 'direct');
  v_parent_gid text;
  v_coupon_source text := 'internal';
  v_needs_recon boolean := false;
  v_redeem_online boolean := false;
  v_discount_summary text;
  v_store_url text;
  v_disc_type text;
  v_disc_value numeric;
begin
  if not check_rate_limit('ip:' || p_ip, 20) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select c.* into v_campaign from campaigns c
    join businesses b on b.id = c.business_id
   where c.slug = p_campaign_slug
     and b.slug = p_merchant_slug
     and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  if not check_rate_limit('ipcamp:' || v_campaign.id::text || ':' || p_ip, 8) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if p_device_id is not null and length(trim(p_device_id)) >= 8 then
    if not check_rate_limit('dev:' || trim(p_device_id), 6) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    if not check_rate_limit('devcamp:' || v_campaign.id::text || ':' || trim(p_device_id), 3) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end if;

  select b.* into v_business from businesses b
   where b.id = v_campaign.business_id and b.active = true;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  select * into v_config from campaign_coupon_configs
   where campaign_id = v_campaign.id;
  v_has_config := found;

  if v_campaign.play_limit is not null then
    select count(*) into v_play_count from plays where campaign_id = v_campaign.id;
    if v_play_count >= v_campaign.play_limit then
      return jsonb_build_object('status', 'campaign_full');
    end if;
  end if;

  insert into customers (business_id, phone, name)
  values (v_campaign.business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id, (xmax = 0) into v_customer_id, v_is_new_customer;

  if v_is_new_customer then
    perform loyalty_award_signup_points(
      v_campaign.business_id, v_customer_id,
      'loyalty:earn:signup:' || v_customer_id::text
    );
  end if;

  select count(*) into v_prior_plays from plays
   where business_id = v_campaign.business_id and customer_id = v_customer_id;

  if exists (select 1 from plays
              where campaign_id = v_campaign.id and customer_id = v_customer_id) then
    return jsonb_build_object('status', 'already_played');
  end if;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'registration', null, null,
                                jsonb_build_object('name', p_name, 'source', v_source));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'customer.registered',
                                jsonb_build_object('customerName', p_name,
                                                   'returning', v_prior_plays > 0,
                                                   'source', v_source),
                                p_ip, null);
  if v_prior_plays > 0 then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'return_visit', null, null,
                                  jsonb_build_object('prior_plays', v_prior_plays, 'source', v_source));
  end if;

  if v_has_config and v_config.win_mode = 'always' then
    v_prize_id := allocate_prize_always(v_campaign.id);
  else
    v_prize_id := allocate_prize(v_campaign.id);
  end if;
  if v_prize_id is not null then
    select * into v_prize from prizes where id = v_prize_id;
    v_won := true;
  end if;

  insert into plays (campaign_id, business_id, customer_id, won, prize_id)
  values (v_campaign.id, v_campaign.business_id, v_customer_id, v_won, v_prize_id)
  returning id into v_play_id;

  if not v_has_config then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'scratch', null, null,
                                  jsonb_build_object('source', v_source));
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'customer', v_customer_id,
                                  'scratch.completed',
                                  jsonb_build_object('won', v_won, 'source', v_source),
                                  p_ip, null);
  end if;

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null,
                                  jsonb_build_object('source', v_source));
    return jsonb_build_object(
      'status', 'ok',
      'won', false,
      'defer_scratch_event', v_has_config);
  end if;

  if v_has_config then
    v_parent_gid := v_prize.shopify_parent_discount_id;
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal_fallback';
    v_needs_recon := true;
  else
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal';
  end if;

  v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                     v_campaign.ends_at + interval '15 days');
  insert into coupons (business_id, campaign_id, prize_id, customer_id,
                       play_id, code, prize_name, expires_at,
                       source, pool_id, shopify_parent_discount_id,
                       shopify_discount_code_id, needs_reconciliation)
  values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
          v_play_id, v_code, v_prize.name, v_expires,
          v_coupon_source, null, v_parent_gid,
          null, v_needs_recon)
  returning id into v_coupon_id;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code, 'source', v_source,
                                                   'coupon_source', v_coupon_source));

  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'prize.allocated',
                                jsonb_build_object(
                                  'customerId', v_customer_id,
                                  'customerName', p_name,
                                  'prizeId', v_prize.id,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'couponId', v_coupon_id,
                                  'source', v_source),
                                p_ip, null);
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'coupon.generated',
                                jsonb_build_object(
                                  'couponCode', v_code,
                                  'couponId', v_coupon_id,
                                  'couponSource', v_coupon_source,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'source', v_source),
                                p_ip, null);

  perform loyalty_award_campaign_play_points(
    v_campaign.business_id, v_customer_id, v_campaign.id, v_play_id,
    v_prize.prize_type, v_prize.prize_value
  );

  select coalesce(sum(greatest(total_quantity - won_count, 0)), 0)
    into v_real_remaining
    from prizes
   where campaign_id = v_campaign.id and not is_fallback;
  if v_real_remaining = 0 and not v_prize.is_fallback then
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'system', null,
                                  'prize.exhausted',
                                  jsonb_build_object('lastPrizeId', v_prize.id,
                                                     'lastPrizeName', v_prize.name),
                                  null, null);
  end if;

  if v_has_config then
    v_redeem_online := v_parent_gid is not null;
    v_disc_type  := coalesce(v_prize.discount_type, v_config.discount_type);
    v_disc_value := coalesce(v_prize.discount_value, v_config.discount_value);
    if v_disc_type = 'percentage' then
      v_discount_summary := trim(to_char(v_disc_value, 'FM990.##')) || '% off';
    elsif v_disc_type = 'fixed_amount' then
      v_discount_summary := coalesce(v_config.currency, 'INR') || ' ' ||
                            trim(to_char(v_disc_value, 'FM999999990.##')) || ' off';
    end if;
    select 'https://' || s.shop_domain into v_store_url
      from shopify_shops s
     where s.business_id = v_campaign.business_id
     order by s.installed_at
     limit 1;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'campaign_id', v_campaign.id,
    'prize_id', v_prize.id,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'prize_image_url', v_prize.image_url,
    'prize_background_color', v_prize.background_color,
    'coupon_id', v_coupon_id,
    'coupon_code', v_code,
    'coupon_source', v_coupon_source,
    'shopify_parent_discount_id', v_parent_gid,
    'redeem_online', v_redeem_online,
    'discount_summary', v_discount_summary,
    'store_url', v_store_url,
    'expires_at', v_expires,
    'defer_scratch_event', v_has_config);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function play_campaign(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- Seed default rules for existing businesses.
insert into points_rules (business_id, rule_type, points_per_unit, fixed_points, active)
select b.id, r.rule_type, r.points_per_unit, r.fixed_points, true
from businesses b
cross join (values
  ('purchase',        10::numeric, null::int),
  ('signup',          null::numeric, 25),
  ('first_purchase',  null::numeric, 100),
  ('birthday',        null::numeric, 50),
  ('referral',        null::numeric, 100),
  ('review',          null::numeric, 30),
  ('campaign_play',   null::numeric, 20)
) as r(rule_type, points_per_unit, fixed_points)
on conflict (business_id, rule_type) do nothing;
