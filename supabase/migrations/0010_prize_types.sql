-- =============================================================
-- EngageOS Release V1 — Migration 0010: Prize Types & Fallback
-- Adds a prize taxonomy (coupon / physical gift / voucher /
-- lucky-draw / cashback / wallet points), an optional numeric
-- value (₹ for cashback/voucher, count for points), and a
-- per-campaign fallback flag used by the prize engine when the
-- drawn prize is out of stock. Fully backward-compatible:
-- existing prizes become 'coupon' with no value and no fallback.
-- =============================================================

-- 1. Prize type taxonomy. Default 'coupon' preserves current behavior.
alter table prizes
  add column if not exists prize_type text not null default 'coupon'
    check (prize_type in (
      'coupon',          -- discount / offer coupon (the historical default)
      'physical_gift',   -- collect at counter
      'gift_voucher',    -- monetary voucher, code redeemable
      'lucky_draw',      -- entry into an end-of-campaign draw
      'cashback',        -- ₹ credited on purchase
      'wallet_points'    -- loyalty points added
    )),
  -- Optional magnitude: ₹ value for cashback/voucher, point count for
  -- wallet_points. Null for types where a bare name is enough (coupon,
  -- physical_gift, lucky_draw).
  add column if not exists prize_value numeric(12,2) check (prize_value is null or prize_value >= 0),
  -- Fallback prize: awarded when the weighted draw selects an exhausted
  -- prize, or when the entire in-stock pool is empty. Typically a
  -- large/unlimited-stock consolation coupon.
  add column if not exists is_fallback boolean not null default false;

-- 2. At most one fallback prize per campaign (partial unique index).
create unique index if not exists prizes_one_fallback_per_campaign
  on prizes (campaign_id) where is_fallback;

-- 3. Helpful index for engine draws (in-stock, weighted, non-fallback first).
create index if not exists prizes_campaign_stock_idx
  on prizes (campaign_id) where weight > 0;
