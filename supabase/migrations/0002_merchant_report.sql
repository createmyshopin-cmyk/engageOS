-- =============================================================
-- EngageOS MVP — Migration 0002
-- Merchant report: single-call aggregates for the magic-link view
-- and the nightly WhatsApp report. Read-only, token-scoped.
-- =============================================================

create or replace function merchant_report(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'business_id', b.id,
    'business_name', b.name,
    'slug', b.slug,
    'totals', (
      select jsonb_build_object(
        'customers', (select count(*) from customers c where c.business_id = b.id),
        'plays',     (select count(*) from plays p where p.business_id = b.id),
        'wins',      (select count(*) from plays p where p.business_id = b.id and p.won),
        'redeemed',  (select count(*) from coupons cp where cp.business_id = b.id and cp.status = 'redeemed')
      )
    ),
    'campaigns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.name,
        'status', c.status,
        'ends_at', c.ends_at,
        'plays',    (select count(*) from plays p where p.campaign_id = c.id),
        'wins',     (select count(*) from plays p where p.campaign_id = c.id and p.won),
        'redeemed', (select count(*) from coupons cp where cp.campaign_id = c.id and cp.status = 'redeemed')
      ) order by c.created_at desc), '[]'::jsonb)
      from campaigns c where c.business_id = b.id
    )
  )
  from businesses b
  where b.merchant_token = p_token and b.active = true
$$;

revoke execute on function merchant_report(uuid) from public, anon, authenticated;
