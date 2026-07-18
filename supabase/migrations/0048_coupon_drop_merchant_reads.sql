-- =============================================================
-- 0048_coupon_drop_merchant_reads.sql — merchant-facing read RPCs powering the
-- Coupon Drop visibility cards on /m/shopify. Strictly additive: two new
-- read-only functions, no schema/behavior changes elsewhere.
--
-- Both take an explicit p_business_id and join through campaigns to enforce
-- tenant ownership IN SQL. SECURITY DEFINER with search_path pinned; execute
-- revoked from public/anon/authenticated (called only via the service-role
-- TenantRepository, mirroring coupon_drop_stats from 0047).
-- =============================================================

-- =============================================================
-- 1. coupon_drop_campaign_overview — one row per coupon_drop campaign for the
--    tenant, summarizing pool lifecycle + minted/available/claimed/redeemed
--    counts and the Shopify parent discount id. Drives the "Coupon Drop codes"
--    card so the merchant sees, per campaign, what was generated in Shopify.
-- =============================================================
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
       from campaign_coupon_pool p
      where p.campaign_id = c.id),
    (select coalesce(sum((p.status = 'available')::int), 0)::int
       from campaign_coupon_pool p
      where p.campaign_id = c.id),
    (select coalesce(sum((p.status = 'claimed')::int), 0)::int
       from campaign_coupon_pool p
      where p.campaign_id = c.id),
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

-- =============================================================
-- 2. coupon_drop_sample_codes — a few recent pool rows for one campaign so the
--    merchant can eyeball the actual generated codes + their Shopify redeem-code
--    ids. Tenant-guarded via the campaigns join; p_limit clamped to [1,25].
-- =============================================================
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
  select p.code, p.status, p.shopify_redeem_code_id, p.claimed_at, p.created_at
  from campaign_coupon_pool p
  join campaigns c on c.id = p.campaign_id
  where p.campaign_id = p_campaign_id
    and c.business_id = p_business_id
    and p.business_id = p_business_id
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

revoke execute on function coupon_drop_sample_codes(uuid, uuid, int)
  from public, anon, authenticated;
