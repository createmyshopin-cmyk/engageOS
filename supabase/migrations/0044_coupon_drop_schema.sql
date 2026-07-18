-- =============================================================
-- 0044_coupon_drop_schema.sql — Coupon Drop campaign type + Shopify
-- unique-discount-code pool (schema only; RPCs land in 0045–0047).
--
-- A "Coupon Drop" campaign issues each winner a UNIQUE Shopify discount code.
-- Because play_campaign is a plpgsql SECURITY DEFINER function (no HTTP), codes
-- are PRE-MINTED into a pool by the Node layer (one parent Shopify discount +
-- a bulk set of unique redeem codes) and only atomically CLAIMED in SQL.
--
-- STRICTLY ADDITIVE & BACKWARD COMPATIBLE:
--   - campaigns.campaign_type defaults to 'scratch_win' → every existing row
--     stays valid and behaves exactly as before.
--   - New tables are RLS-locked, execute/all revoked from anon/authenticated,
--     mirroring 0038.
--   - coupons / orders gain only nullable, defaulted columns. A campaign with
--     no pool rows falls through to the existing internal-code path unchanged.
-- =============================================================

-- =============================================================
-- 1. campaign_type discriminator on campaigns (default keeps old rows valid).
-- =============================================================
alter table campaigns
  add column if not exists campaign_type text not null default 'scratch_win'
    check (campaign_type in (
      'scratch_win','spin_win','lucky_draw','quiz_challenge','collect_win','coupon_drop'
    ));

-- =============================================================
-- 2. campaign_coupon_configs — one row per coupon_drop campaign holding the
--    merchant's discount rules + pool lifecycle state. discount_type/value are
--    NOT NULL-enforced at the app layer for coupon_drop (nullable here so the
--    table stays additive and other campaign types never need a row).
-- =============================================================
create table if not exists campaign_coupon_configs (
  campaign_id                uuid primary key references campaigns(id) on delete cascade,
  business_id                uuid not null references businesses(id) on delete cascade,
  win_mode                   text not null default 'weighted'
                               check (win_mode in ('weighted','always')),
  discount_type              text check (discount_type in ('percentage','fixed_amount')),
  discount_value             numeric(12,2),
  minimum_subtotal           numeric(12,2),
  usage_limit                int,
  applies_once_per_customer  boolean not null default false,
  expiry_days                int,
  scope_product_ids          text[] not null default '{}',
  scope_collection_ids       text[] not null default '{}',
  currency                   text not null default 'INR',
  shopify_parent_discount_id text,
  pool_target                int not null default 500,
  pool_low_watermark         int not null default 100,
  pool_status                text not null default 'pending'
                               check (pool_status in ('pending','minting','ready','error','disabled')),
  pool_last_error            text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists coupon_configs_business_idx
  on campaign_coupon_configs (business_id);

-- =============================================================
-- 3. campaign_coupon_pool — pre-minted unique Shopify codes. A win CLAIMS a
--    free row via FOR UPDATE SKIP LOCKED, so reveal is instant and race-safe.
-- =============================================================
create table if not exists campaign_coupon_pool (
  id                         uuid primary key default gen_random_uuid(),
  business_id                uuid not null references businesses(id) on delete cascade,
  campaign_id                uuid not null references campaigns(id) on delete cascade,
  shopify_parent_discount_id text,
  code                       text not null,
  shopify_redeem_code_id     text,
  status                     text not null default 'available'
                               check (status in ('available','claimed','void')),
  claimed_by_play_id         uuid references plays(id) on delete set null,
  claimed_by_coupon_id       uuid references coupons(id) on delete set null,
  claimed_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  unique (campaign_id, code)
);

-- O(1) claim: only scans available rows for a campaign, oldest first.
create index if not exists coupon_pool_available_idx
  on campaign_coupon_pool (campaign_id, created_at)
  where status = 'available';

create index if not exists coupon_pool_business_idx
  on campaign_coupon_pool (business_id);

-- =============================================================
-- 4. coupons — additive source-tracking + Shopify link columns.
--    'internal'          = legacy PREFIX-XXXX (default; every existing row).
--    'shopify_pool'      = a unique Shopify code claimed from the pool.
--    'internal_fallback' = pool empty / Shopify down → internal code issued,
--                          flagged for later reconciliation.
-- =============================================================
alter table coupons
  add column if not exists source text not null default 'internal'
    check (source in ('internal','shopify_pool','internal_fallback')),
  add column if not exists shopify_parent_discount_id text,
  add column if not exists shopify_discount_code_id text,
  add column if not exists pool_id uuid references campaign_coupon_pool(id) on delete set null,
  add column if not exists needs_reconciliation boolean not null default false;

-- =============================================================
-- 5. orders — additive attribution columns (which campaign/coupon drove the
--    sale + the raw discount code used). Nullable; set on ingest when a code
--    matches. Partial indexes keep campaign-level analytics cheap.
-- =============================================================
alter table orders
  add column if not exists campaign_id uuid references campaigns(id) on delete set null,
  add column if not exists coupon_id uuid references coupons(id) on delete set null,
  add column if not exists discount_code text;

create index if not exists orders_campaign_idx
  on orders (campaign_id, placed_at desc) where campaign_id is not null;
create index if not exists orders_coupon_idx
  on orders (coupon_id) where coupon_id is not null;

-- =============================================================
-- 6. updated_at trigger (reuse set_updated_at from 0034).
-- =============================================================
drop trigger if exists coupon_configs_set_updated_at on campaign_coupon_configs;
create trigger coupon_configs_set_updated_at
  before update on campaign_coupon_configs for each row execute function set_updated_at();

-- =============================================================
-- 7. Lockdown: RLS on + revoke all from anon/authenticated (mirror 0038).
-- =============================================================
alter table campaign_coupon_configs enable row level security;
alter table campaign_coupon_pool    enable row level security;

revoke all on campaign_coupon_configs, campaign_coupon_pool
  from anon, authenticated;
