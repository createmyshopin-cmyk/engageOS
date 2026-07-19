-- =============================================================
-- EngageOS — Migration 0067: Security lockdown hardening.
--
-- Closes gaps from the security audit:
--   - REVOKE EXECUTE on helper SECURITY DEFINER functions
--   - REVOKE on notifications table
--   - RLS on merchants / merchant_sessions (credential tables)
-- =============================================================

-- Helper functions that should only be callable via service role.
revoke execute on function purge_expired_merchant_sessions() from public, anon, authenticated;

revoke execute on function generate_coupon_code(text) from public, anon, authenticated;
revoke execute on function generate_coupon_code() from public, anon, authenticated;

revoke execute on function gen_public_id() from public, anon, authenticated;

-- Belt-and-braces: notifications had RLS but no explicit revoke.
revoke all on notifications from anon, authenticated;

-- Credential tables: revoke alone is not enough — enable RLS default-deny.
alter table merchants enable row level security;
alter table merchant_sessions enable row level security;
