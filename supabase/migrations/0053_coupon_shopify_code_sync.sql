-- =============================================================
-- 0053_coupon_shopify_code_sync.sql
-- Keep coupons.code in sync with the exact string Shopify accepted.
-- Real-time minting must not link unless the confirmed code matches.
-- =============================================================

create or replace function coupon_link_shopify(
  p_business_id uuid,
  p_coupon_id uuid,
  p_redeem_id text,
  p_parent_gid text,
  p_confirmed_code text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update coupons c
     set code = coalesce(nullif(upper(trim(p_confirmed_code)), ''), c.code),
         shopify_discount_code_id = p_redeem_id,
         shopify_parent_discount_id = coalesce(p_parent_gid, c.shopify_parent_discount_id),
         source = 'shopify_realtime',
         needs_reconciliation = false
   where c.id = p_coupon_id
     and c.business_id = p_business_id
     and exists (
       select 1 from campaigns cm
        where cm.id = c.campaign_id
          and cm.business_id = p_business_id
     );
end $$;

revoke execute on function coupon_link_shopify(uuid, uuid, text, text, text)
  from public, anon, authenticated;

-- Backfill: uppercase any mixed-case coupon codes so EngageOS matches Shopify.
update coupons
   set code = upper(trim(code))
 where code <> upper(trim(code));
