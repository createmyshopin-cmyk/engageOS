-- Add campaign slug to Coupon Drop overview for disambiguation in /m/shopify.

drop function if exists coupon_drop_campaign_overview(uuid);

create function coupon_drop_campaign_overview(
  p_business_id uuid
) returns table (
  campaign_id                uuid,
  campaign_name              text,
  campaign_slug              text,
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
    coalesce(nullif(trim(c.headline), ''), c.name),
    c.slug,
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
        and cp.shopify_discount_code_id is not null),
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
