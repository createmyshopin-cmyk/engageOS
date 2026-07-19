import "server-only";
import { adminClient } from "@/lib/db/rpc";
import { getShopifyForBusiness, refreshShopifyScopes } from "@/lib/shopify/adapter";
import {
  bulkAddCodes,
  createParentDiscount,
  updateParentDiscountTitle,
  generatePoolCodes,
  normalizeCouponCode,
  pollBulkCreation,
  verifyDiscountCodeInShopify,
  ShopifyDiscountError,
  type DiscountConfig,
} from "@/lib/shopify/discounts";
import { isScopeGranted } from "@/lib/shopify/scopes";
import { ShopifyApiError } from "@/lib/shopify/client";
import type { ShopifyClient } from "@/lib/shopify/client";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

/**
 * Coupon Drop orchestration — the glue between the Node-side Shopify Discount API
 * (discounts.ts) and the SQL coupon lifecycle. Runs server-side only, off the
 * request path via `after()` / cron.
 *
 * Real-time model (0050):
 *   * On activation, create ONE parent discount per prize tier (the merchant's
 *     rule: percentage/amount, minimums, scopes). No pool is pre-minted.
 *   * On each win, play_campaign issues a unique code using the campaign's custom
 *     prefix; mintCouponForWin then attaches THAT code to the won tier's parent
 *     discount in Shopify and links the redeem-code id back onto the coupon.
 *   * Any Shopify failure leaves the customer's internal fallback code intact — a
 *     win is never blocked.
 */

interface CouponConfigRow {
  campaign_id: string;
  business_id: string;
  discount_type: "percentage" | "fixed_amount" | null;
  discount_value: number | null;
  minimum_subtotal: number | null;
  usage_limit: number | null;
  applies_once_per_customer: boolean;
  currency: string | null;
  scope_product_ids: string[] | null;
  scope_collection_ids: string[] | null;
  pool_target: number;
  pool_low_watermark: number;
  shopify_parent_discount_id: string | null;
}

/**
 * One coupon prize tier. Each tier owns its OWN Shopify parent discount (fixed
 * %/amount) and its own segment of the pool, so a customer who wins this tier is
 * issued a code that actually carries this tier's discount.
 */
interface CouponTier {
  prize_id: string;
  name: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  total_quantity: number;
  shopify_parent_discount_id: string | null;
}

/** True when the granted scope string includes write_discounts. */
export function hasWriteDiscounts(scopes: string | null | undefined): boolean {
  return isScopeGranted("write_discounts", scopes);
}

/**
 * Confirm the tenant can mint discount codes, self-healing a stale Dev Dashboard
 * token. The stored `scopes` reflect the LAST token exchange; if the merchant
 * enabled write_discounts afterwards, the still-valid 24h token — and thus the
 * stored scopes — lag until re-requested. So when the stored set looks like it's
 * missing the scope, we force a fresh re-exchange (which mints a new token
 * carrying the current scopes) and re-check before giving up. Returns the
 * effective scope string that granted (or failed) the check.
 */
async function ensureWriteDiscounts(
  businessId: string,
  storedScopes: string | null | undefined
): Promise<{ ok: boolean; scopes: string | null }> {
  if (hasWriteDiscounts(storedScopes)) return { ok: true, scopes: storedScopes ?? null };
  const refreshed = await refreshShopifyScopes(businessId);
  return { ok: hasWriteDiscounts(refreshed), scopes: refreshed };
}

async function loadConfig(
  businessId: string,
  campaignId: string
): Promise<CouponConfigRow | null> {
  const { data, error } = await adminClient()
    .from("campaign_coupon_configs")
    .select(
      "campaign_id,business_id,discount_type,discount_value,minimum_subtotal,usage_limit,applies_once_per_customer,currency,scope_product_ids,scope_collection_ids,pool_target,pool_low_watermark,shopify_parent_discount_id"
    )
    .eq("business_id", businessId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`loadConfig failed: ${error.message}`);
  return (data as CouponConfigRow | null) ?? null;
}

/** A raw coupon prize row as loaded from the DB (pre-resolution). */
export interface RawCouponPrize {
  id: string;
  name: string;
  discount_type: "percentage" | "fixed_amount" | null;
  discount_value: number | null;
  total_quantity: number | null;
  shopify_parent_discount_id: string | null;
}

/**
 * Pure tier resolution: turn raw coupon prizes into mintable tiers. A tier needs
 * a positive discount to be mintable; a tier without its own discount inherits
 * the campaign-level config discount (legacy single-tier campaigns), so the pool
 * still splits per prize even before merchants set per-tier percentages. Tiers
 * with no resolvable positive discount are dropped.
 */
export function resolveTiers(
  rows: RawCouponPrize[],
  fallback: { discount_type: "percentage" | "fixed_amount" | null; discount_value: number | null }
): CouponTier[] {
  return rows
    .map((r) => {
      const discountType = r.discount_type ?? fallback.discount_type;
      const discountValue = r.discount_value ?? fallback.discount_value;
      if (!discountType || !discountValue || discountValue <= 0) return null;
      return {
        prize_id: r.id,
        name: r.name,
        discount_type: discountType,
        discount_value: Number(discountValue),
        total_quantity: r.total_quantity ?? 0,
        shopify_parent_discount_id: r.shopify_parent_discount_id,
      } satisfies CouponTier;
    })
    .filter((t): t is CouponTier => t !== null);
}

/** Customer-facing campaign title for Shopify Admin discount names. */
export function buildParentDiscountTitle(
  campaignTitle: string,
  tierName: string,
  tierCount: number
): string {
  const base = campaignTitle.trim() || "EngageOS Campaign";
  const full = tierCount > 1 ? `${base} — ${tierName.trim()}` : base;
  return full.length > 120 ? `${full.slice(0, 117)}...` : full;
}

async function loadCampaignTitle(campaignId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from("campaigns")
    .select("name, headline")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(`loadCampaignTitle failed: ${error.message}`);
  const row = data as { name: string; headline: string | null } | null;
  return row?.headline?.trim() || row?.name?.trim() || "EngageOS Campaign";
}

/**
 * The campaign's coupon prize tiers, each an independent Shopify discount. See
 * {@link resolveTiers} for the resolution rules.
 */
async function loadTiers(
  campaignId: string,
  cfg: CouponConfigRow
): Promise<CouponTier[]> {
  const { data, error } = await adminClient()
    .from("prizes")
    .select(
      "id,name,discount_type,discount_value,total_quantity,prize_type,shopify_parent_discount_id"
    )
    .eq("campaign_id", campaignId)
    .eq("prize_type", "coupon");
  if (error) throw new Error(`loadTiers failed: ${error.message}`);

  const rows = (data as RawCouponPrize[] | null) ?? [];
  return resolveTiers(rows, {
    discount_type: cfg.discount_type,
    discount_value: cfg.discount_value,
  });
}

async function setStatus(
  businessId: string,
  campaignId: string,
  status: string,
  err: string | null = null
): Promise<void> {
  const { error } = await adminClient().rpc("coupon_pool_set_status", {
    p_business_id: businessId,
    p_campaign_id: campaignId,
    p_pool_status: status,
    p_error: err,
  });
  if (error) throw new Error(`coupon_pool_set_status failed: ${error.message}`);
}

/**
 * Build the Shopify discount config for ONE tier: the tier's own discount
 * type/value, plus the campaign-level rules (min subtotal, usage limit, scopes)
 * shared by every tier.
 */
function tierDiscountConfig(cfg: CouponConfigRow, tier: CouponTier): DiscountConfig {
  return {
    discountType: tier.discount_type,
    discountValue: tier.discount_value,
    minimumSubtotal: cfg.minimum_subtotal,
    usageLimit: cfg.usage_limit,
    appliesOncePerCustomer: cfg.applies_once_per_customer,
    currency: cfg.currency,
    scopeProductIds: cfg.scope_product_ids ?? [],
    scopeCollectionIds: cfg.scope_collection_ids ?? [],
  };
}

/**
 * Real-time mint for ONE winning play. The customer already holds `code` (issued
 * by play_campaign using the campaign's custom prefix, flagged for
 * reconciliation). Here we register that exact code in Shopify against the won
 * tier's parent discount so it becomes redeemable online at the tier's discount,
 * then link the Shopify redeem-code id back onto the coupon row.
 *
 * Never throws: on any failure (no Shopify, missing scope, bulk error) the coupon
 * stays as the internal fallback the customer already has — a win is never
 * blocked. Runs off the response path (called from the play route's `after()`).
 * Returns whether the coupon was linked to a live Shopify code.
 */
export async function mintCouponForWin(params: {
  businessId: string;
  campaignId: string;
  prizeId: string;
  couponId: string;
  code: string;
  parentGid: string | null;
}): Promise<{ linked: boolean; confirmedCode?: string }> {
  const { businessId, campaignId, prizeId, couponId } = params;
  const requestedCode = normalizeCouponCode(params.code);
  const log = createLogger(newCorrelationId(), {
    route: "coupon-drop.mint-win",
    businessId,
    campaignId,
  });
  try {
    const shopify = await getShopifyForBusiness(businessId);
    if (!shopify) return { linked: false };

    if (!hasWriteDiscounts(shopify.shop.scopes)) {
      const check = await ensureWriteDiscounts(businessId, shopify.shop.scopes);
      if (!check.ok) return { linked: false };
    }

    let parentGid = params.parentGid;
    if (!parentGid) {
      const cfg = await loadConfig(businessId, campaignId);
      if (!cfg) return { linked: false };
      const tiers = await loadTiers(campaignId, cfg);
      const tier = tiers.find((t) => t.prize_id === prizeId);
      if (!tier) return { linked: false };
      const campaignTitle = await loadCampaignTitle(campaignId);
      parentGid = await ensureTierParent(
        businessId,
        campaignId,
        cfg,
        tier,
        shopify.client,
        { campaignTitle, tierCount: tiers.length }
      );
    }

    const bulkId = await bulkAddCodes(shopify.client, parentGid, [requestedCode]);
    if (!bulkId) return { linked: false };

    const result = await pollBulkCreation(shopify.client, bulkId);
    const confirmed = result.codes.find((c) => c.code === requestedCode);
    if (!confirmed?.redeemId) {
      log.warn("coupon_drop.mint_win_unconfirmed", {
        couponId,
        requestedCode,
        shopifyCodes: result.codes.map((c) => c.code),
        failedCount: result.failedCount,
        done: result.done,
      });
      return { linked: false };
    }

    const { error } = await adminClient().rpc("coupon_link_shopify", {
      p_business_id: businessId,
      p_coupon_id: couponId,
      p_redeem_id: confirmed.redeemId,
      p_parent_gid: parentGid,
      p_confirmed_code: confirmed.code,
    });
    if (error) throw new Error(`coupon_link_shopify failed: ${error.message}`);

    const verified = await verifyDiscountCodeInShopify(
      shopify.client,
      shopify.shop.shop_domain,
      confirmed.code,
      confirmed.redeemId,
      parentGid
    );
    if (!verified.found) {
      log.warn("coupon_drop.mint_win_verify_failed", {
        couponId,
        code: confirmed.code,
        redeemId: confirmed.redeemId,
      });
      await adminClient()
        .from("coupons")
        .update({ needs_reconciliation: true, source: "internal_fallback" })
        .eq("id", couponId)
        .eq("business_id", businessId);
      return { linked: false };
    }

    log.info("coupon_drop.mint_win_ok", {
      couponId,
      prizeId,
      code: confirmed.code,
      parentTitle: verified.parentTitle,
    });
    return { linked: true, confirmedCode: confirmed.code };
  } catch (err) {
    log.error("coupon_drop.mint_win_failed", { couponId, err: errorMessage(err) });
    return { linked: false };
  }
}

/**
 * Ensure a tier has a Shopify parent discount (the rule), creating it if absent
 * and persisting the id via coupon_prize_set_parent. Returns the parent GID.
 */
async function ensureTierParent(
  businessId: string,
  campaignId: string,
  cfg: CouponConfigRow,
  tier: CouponTier,
  client: ShopifyClient,
  opts: { campaignTitle: string; tierCount: number }
): Promise<string> {
  const title = buildParentDiscountTitle(opts.campaignTitle, tier.name, opts.tierCount);

  if (tier.shopify_parent_discount_id) {
    try {
      await updateParentDiscountTitle(client, tier.shopify_parent_discount_id, title);
    } catch {
      // Best effort — an old title should not block minting new codes.
    }
    return tier.shopify_parent_discount_id;
  }

  const placeholder = generatePoolCodes("PARENT", 1)[0];
  const parentGid = await createParentDiscount(
    client,
    title,
    tierDiscountConfig(cfg, tier),
    placeholder
  );
  const { error } = await adminClient().rpc("coupon_prize_set_parent", {
    p_business_id: businessId,
    p_campaign_id: campaignId,
    p_prize_id: tier.prize_id,
    p_parent_gid: parentGid,
  });
  if (error) throw new Error(`coupon_prize_set_parent failed: ${error.message}`);
  return parentGid;
}

/**
 * Full pool activation on campaign go-live. A coupon_drop campaign can have
 * several prize tiers (e.g. 10% / 5%); each is an INDEPENDENT Shopify discount:
 * for every tier we create (or reuse) its own parent discount and mint that
 * tier's own pool of codes, tagged with the tier's prize_id. This is what makes
 * a 5%-tier winner receive a genuine 5% code instead of borrowing another
 * tier's. Idempotent-ish: existing parents are reused and only topped up.
 * Records error status on failure so the merchant is guided to fix scope.
 */
export async function activateCouponDropPool(
  businessId: string,
  campaignId: string
): Promise<void> {
  const log = createLogger(newCorrelationId(), {
    route: "coupon-drop.activate",
    businessId,
    campaignId,
  });

  try {
    const cfg = await loadConfig(businessId, campaignId);
    if (!cfg) {
      log.warn("coupon_drop.no_config");
      return;
    }

    const tiers = await loadTiers(campaignId, cfg);
    if (tiers.length === 0) {
      await setStatus(
        businessId,
        campaignId,
        "error",
        "Set a discount on at least one coupon reward tier before activating."
      );
      return;
    }

    const shopify = await getShopifyForBusiness(businessId);
    if (!shopify) {
      await setStatus(
        businessId,
        campaignId,
        "error",
        "Shopify is not connected. Connect your store to mint discount codes."
      );
      return;
    }
    if (!hasWriteDiscounts(shopify.shop.scopes)) {
      // Stale token? Force a re-exchange to pick up a newly-enabled scope before
      // erroring out — the merchant may have just granted write_discounts.
      const check = await ensureWriteDiscounts(businessId, shopify.shop.scopes);
      if (!check.ok) {
        await setStatus(
          businessId,
          campaignId,
          "error",
          "Missing the write_discounts permission. Enable it on your Shopify app, deploy, then reconnect or refresh permissions."
        );
        return;
      }
    }

    await setStatus(businessId, campaignId, "minting");

    const campaignTitle = await loadCampaignTitle(campaignId);

    // Real-time model: activation only creates each tier's PARENT discount (the
    // rule). Codes are minted per-customer at play time (mintCouponForWin), each
    // carrying the campaign's custom prefix. No pool is pre-minted here.
    let firstParentGid: string | null = cfg.shopify_parent_discount_id;
    for (const tier of tiers) {
      const parentGid = await ensureTierParent(
        businessId,
        campaignId,
        cfg,
        tier,
        shopify.client,
        { campaignTitle, tierCount: tiers.length }
      );
      firstParentGid ??= parentGid;
      log.info("coupon_drop.tier_parent_ready", { prizeId: tier.prize_id, tier: tier.name });
    }

    // Keep the config's parent pointer populated (used as the "activated" flag).
    // Point it at the first tier's parent for continuity.
    if (firstParentGid && firstParentGid !== cfg.shopify_parent_discount_id) {
      const { error } = await adminClient().rpc("coupon_config_set_parent", {
        p_business_id: businessId,
        p_campaign_id: campaignId,
        p_parent_gid: firstParentGid,
        p_pool_status: "ready",
      });
      if (error) throw new Error(`coupon_config_set_parent failed: ${error.message}`);
    }

    await setStatus(businessId, campaignId, "ready");
    log.info("coupon_drop.parents_ready", { tiers: tiers.length });
  } catch (err) {
    const message = errorMessage(err);
    log.error("coupon_drop.activate_failed", { err: message });
    try {
      await setStatus(businessId, campaignId, "error", message.slice(0, 500));
    } catch {
      // best effort — status write failing shouldn't mask the original error
    }
  }
}

/**
 * Refill path retained for API/cron compatibility. Under the real-time minting
 * model there is no pre-minted pool to refill (codes are minted per win), so this
 * is a no-op. Kept so the daily cron and the play route import sites don't break.
 */
export async function topUpPoolIfLow(
  _businessId: string,
  _campaignId: string
): Promise<void> {
  // No-op: real-time minting issues codes at play time, not from a pool.
}

/**
 * Daily cron sweep. Retained for the scheduler tick; a no-op under the real-time
 * minting model (there is no pool to refill). Returns swept: 0.
 */
export async function topUpAllCouponDropPools(): Promise<{ swept: number }> {
  return { swept: 0 };
}

interface PendingCouponRow {
  id: string;
  business_id: string;
  campaign_id: string;
  prize_id: string;
  code: string;
  shopify_parent_discount_id: string | null;
}

const RECONCILE_BATCH = 25;

/**
 * Retry Shopify minting for coupons that still need reconciliation after the
 * play route's first attempt. Runs on the cron tick — bounded, best-effort.
 */
export async function reconcilePendingCoupons(
  businessId?: string
): Promise<{ attempted: number; linked: number }> {
  const log = createLogger(newCorrelationId(), {
    route: "coupon-drop.reconcile",
    businessId: businessId ?? "all",
  });

  let campaignQuery = adminClient()
    .from("campaigns")
    .select("id")
    .eq("campaign_type", "coupon_drop");
  if (businessId) {
    campaignQuery = campaignQuery.eq("business_id", businessId);
  }
  const { data: campaigns, error: cErr } = await campaignQuery;
  if (cErr) {
    log.error("coupon_drop.reconcile_campaigns_failed", { err: cErr.message });
    return { attempted: 0, linked: 0 };
  }

  const campaignIds = (campaigns ?? []).map((c) => (c as { id: string }).id);
  if (campaignIds.length === 0) return { attempted: 0, linked: 0 };

  let couponQuery = adminClient()
    .from("coupons")
    .select(
      "id,business_id,campaign_id,prize_id,code,shopify_parent_discount_id"
    )
    .eq("needs_reconciliation", true)
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: true })
    .limit(RECONCILE_BATCH);
  if (businessId) {
    couponQuery = couponQuery.eq("business_id", businessId);
  }

  const { data, error } = await couponQuery;
  if (error) {
    log.error("coupon_drop.reconcile_load_failed", { err: error.message });
    return { attempted: 0, linked: 0 };
  }

  const rows = (data ?? []) as PendingCouponRow[];
  let linked = 0;
  for (const row of rows) {
    const result = await mintCouponForWin({
      businessId: row.business_id,
      campaignId: row.campaign_id,
      prizeId: row.prize_id,
      couponId: row.id,
      code: row.code,
      parentGid: row.shopify_parent_discount_id,
    });
    if (result.linked) linked += 1;
  }

  if (rows.length > 0) {
    log.info("coupon_drop.reconcile_done", { attempted: rows.length, linked });
  }
  return { attempted: rows.length, linked };
}

const MINT_MAX_ATTEMPTS = 3;
const MINT_RETRY_DELAY_MS = 1500;

type WonPlay = {
  status: "ok";
  won: true;
  campaign_id?: string;
  prize_id?: string;
  coupon_id?: string;
  coupon_code?: string;
  shopify_parent_discount_id?: string | null;
  coupon_source?: string;
  redeem_online?: boolean;
  store_url?: string;
  discount_summary?: string;
  shopify_admin_url?: string;
  shopify_discount_title?: string;
};

/**
 * Mint the won coupon in Shopify BEFORE the customer sees it, with retries.
 * Ensures coupons.code in EngageOS matches the live Shopify redeem code.
 */
export async function finalizeCouponDropPlay<T extends WonPlay>(result: T): Promise<T> {
  if (
    !result.campaign_id ||
    !result.prize_id ||
    !result.coupon_id ||
    !result.coupon_code
  ) {
    return result;
  }

  const { data: cfg } = await adminClient()
    .from("campaign_coupon_configs")
    .select("business_id")
    .eq("campaign_id", result.campaign_id)
    .maybeSingle();
  const businessId = (cfg as { business_id: string } | null)?.business_id;
  if (!businessId) return result;

  let linked = false;
  let confirmedCode = normalizeCouponCode(result.coupon_code);

  for (let attempt = 0; attempt < MINT_MAX_ATTEMPTS && !linked; attempt++) {
    const mint = await mintCouponForWin({
      businessId,
      campaignId: result.campaign_id,
      prizeId: result.prize_id,
      couponId: result.coupon_id,
      code: confirmedCode,
      parentGid: result.shopify_parent_discount_id ?? null,
    });
    linked = mint.linked;
    if (mint.confirmedCode) confirmedCode = mint.confirmedCode;
    if (!linked && attempt < MINT_MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, MINT_RETRY_DELAY_MS));
    }
  }

  const { data: coupon } = await adminClient()
    .from("coupons")
    .select("code, source, shopify_discount_code_id, shopify_parent_discount_id")
    .eq("id", result.coupon_id)
    .maybeSingle<{
      code: string;
      source: string;
      shopify_discount_code_id: string | null;
      shopify_parent_discount_id: string | null;
    }>();

  if (!coupon) return { ...result, coupon_code: confirmedCode };

  const shopifyLinked =
    coupon.source === "shopify_realtime" && !!coupon.shopify_discount_code_id;

  let shopifyAdminUrl: string | undefined;
  let shopifyDiscountTitle: string | undefined;

  if (shopifyLinked && businessId) {
    const shopify = await getShopifyForBusiness(businessId);
    if (shopify) {
      const verified = await verifyDiscountCodeInShopify(
        shopify.client,
        shopify.shop.shop_domain,
        coupon.code,
        coupon.shopify_discount_code_id,
        coupon.shopify_parent_discount_id
      );
      if (verified.found) {
        shopifyAdminUrl = verified.adminUrl;
        shopifyDiscountTitle = verified.parentTitle;
      }
    }
  }

  return {
    ...result,
    coupon_code: coupon.code,
    coupon_source: coupon.source as T["coupon_source"],
    redeem_online: shopifyLinked,
    store_url: shopifyLinked ? result.store_url : undefined,
    discount_summary: shopifyLinked ? result.discount_summary : undefined,
    shopify_admin_url: shopifyAdminUrl,
    shopify_discount_title: shopifyDiscountTitle,
  };
}

/**
 * Opportunistic per-campaign top-up. Retained for the play route import site; a
 * no-op under the real-time minting model.
 */
export async function topUpPoolForCampaign(_campaignId: string): Promise<void> {
  // No-op: real-time minting issues codes at play time, not from a pool.
}

function errorMessage(err: unknown): string {
  if (err instanceof ShopifyDiscountError) return err.message;
  if (err instanceof ShopifyApiError) {
    if (err.isAuthError) return "Shopify authorization failed. Reconnect your store.";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
