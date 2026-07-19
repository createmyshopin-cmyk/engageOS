-- =============================================================
-- 0051_coupon_drop_realtime_analytics.sql
-- Point Coupon Drop analytics at the real-time coupons table (0050 model).
-- The pool table (campaign_coupon_pool) is deprecated for new plays; merchant
-- dashboards were showing 0 issued codes when wins were tracked in coupons.
-- =============================================================

-- coupon_drop_stats — campaign-level Coupon Drop analytics
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
       from coupons c
      where c.business_id = p_business_id
        and c.campaign_id = p_campaign_id),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id
        and c.campaign_id = p_campaign_id
        and c.status = 'issued'
        and c.expires_at > now()),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id
        and c.campaign_id = p_campaign_id
        and c.source in ('shopify_realtime', 'internal_fallback', 'shopify_pool')),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id
        and c.campaign_id = p_campaign_id
        and c.status = 'redeemed'),
    (select coalesce(count(*), 0)::int
       from coupons c
      where c.business_id = p_business_id
        and c.campaign_id = p_campaign_id
        and (c.needs_reconciliation = true
             or c.source = 'internal_fallback')),
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

-- coupon_drop_campaign_overview — per-campaign summary for /m/shopify
create or replace function coupon_drop_campaign_overview(
  p_business_id uuid
) returns table (
  campaign_id                uuid,
  campaign_name              text,
  campaign_status            text,
  pool_status                text,
  pool_last_error            text,
  shopify_parent_discount_id text,
  currency                   text,
  codes_minted               int,
  codes_available            int,
  codes_claimed              int,
  codes_redeemed             int
)
language sql stable security definer set search_path = public as $$
  select
    c.id,
    c.name,
    c.status,
    cfg.pool_status,
    cfg.pool_last_error,
    cfg.shopify_parent_discount_id,
    coalesce(cfg.currency, 'INR'),
    (select coalesce(count(*), 0)::int
       from coupons cp
      where cp.campaign_id = c.id
        and cp.business_id = p_business_id),
    (select coalesce(count(*), 0)::int
       from coupons cp
      where cp.campaign_id = c.id
        and cp.business_id = p_business_id
        and cp.status = 'issued'
        and cp.expires_at > now()),
    (select coalesce(count(*), 0)::int
       from coupons cp
      where cp.campaign_id = c.id
        and cp.business_id = p_business_id
        and cp.source in ('shopify_realtime', 'internal_fallback', 'shopify_pool')),
    (select coalesce(count(*), 0)::int
       from coupons cp
      where cp.campaign_id = c.id
        and cp.business_id = p_business_id
        and cp.status = 'redeemed')
  from campaigns c
  join campaign_coupon_configs cfg on cfg.campaign_id = c.id
  where c.business_id = p_business_id
    and c.campaign_type = 'coupon_drop'
  order by c.created_at desc;
$$;

revoke execute on function coupon_drop_campaign_overview(uuid)
  from public, anon, authenticated;

-- coupon_drop_sample_codes — recent issued coupons for merchant inspection
create or replace function coupon_drop_sample_codes(
  p_business_id uuid,
  p_campaign_id uuid,
  p_limit       int
) returns table (
  code                   text,
  status                 text,
  shopify_redeem_code_id text,
  claimed_at             timestamptz,
  created_at             timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    cp.code,
    cp.status,
    cp.shopify_discount_code_id,
    cp.redeemed_at,
    cp.created_at
  from coupons cp
  join campaigns c on c.id = cp.campaign_id
  where cp.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and cp.business_id = p_business_id
  order by cp.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

revoke execute on function coupon_drop_sample_codes(uuid, uuid, int)
  from public, anon, authenticated;
