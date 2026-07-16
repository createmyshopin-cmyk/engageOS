-- =============================================================
-- EngageOS MVP — Migration 0004 (SECURITY)
-- Remove anon read policies. RLS policies filter rows, not
-- columns: the businesses policy exposed staff_pin, merchant_token
-- and phone to anyone holding the public anon key via PostgREST.
-- Nothing in the app uses the anon key (all reads go through
-- security-definer functions with the service role), so the public
-- API surface is exactly: campaign_display(text). Default deny
-- everywhere else.
-- =============================================================

drop policy if exists "anon read business display" on businesses;
drop policy if exists "anon read active campaigns" on campaigns;

-- Belt and braces: revoke table-level grants from anon/authenticated
-- so even a future permissive policy can't re-expose raw tables.
revoke all on businesses, campaigns, prizes, customers, plays, coupons, rate_limits from anon, authenticated;
