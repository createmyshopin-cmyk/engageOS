-- =============================================================
-- 0041_shopify_client_credentials.sql — Dev Dashboard token model
--
-- Shopify retired admin-created custom apps on 2026-01-01. New apps are built
-- in the Dev Dashboard and no longer expose a permanent Admin API access token
-- (shpat_…). Instead the merchant supplies a Client ID + Client Secret, and the
-- integration exchanges them for a SHORT-LIVED access token via the OAuth
-- client-credentials grant (POST /admin/oauth/access_token,
-- grant_type=client_credentials), valid ~24h and refreshed on demand.
--
-- This migration is strictly additive: it adds the columns the new flow needs to
-- shopify_shops (created in 0038). Every column is nullable so existing rows and
-- the 0038/0040 code paths are untouched. No RLS/grants change — shopify_shops
-- was already locked down in 0038.
--
--   * client_id           — the Dev Dashboard app's Client ID (not secret; the
--                           public half of the credential pair)
--   * client_secret_enc   — the Client Secret, AES-256-GCM encrypted app-side.
--                           Doubles as the webhook HMAC key for Dev Dashboard
--                           apps (they sign webhooks with the client secret).
--   * token_expires_at    — when the currently-cached access_token_enc expires;
--                           null means "unknown / legacy permanent token". The
--                           refresh path re-exchanges once now() passes this.
-- =============================================================

alter table shopify_shops
  add column if not exists client_id         text,
  add column if not exists client_secret_enc text,
  add column if not exists token_expires_at  timestamptz;

comment on column shopify_shops.client_id is
  'Dev Dashboard app Client ID (public half); null for legacy admin custom apps.';
comment on column shopify_shops.client_secret_enc is
  'AES-256-GCM encrypted Client Secret; also the webhook HMAC key for Dev Dashboard apps.';
comment on column shopify_shops.token_expires_at is
  'Expiry of the cached client-credentials access token; null = legacy permanent token.';
