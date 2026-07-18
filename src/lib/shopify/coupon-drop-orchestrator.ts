import "server-only";
import { adminClient } from "@/lib/db/rpc";
import { getShopifyForBusiness, refreshShopifyScopes } from "@/lib/shopify/adapter";
import {
  bulkAddCodes,
  chunk,
  createParentDiscount,
  generatePoolCodes,
  pollBulkCreation,
  ShopifyDiscountError,
  type DiscountConfig,
} from "@/lib/shopify/discounts";
import { isScopeGranted } from "@/lib/shopify/scopes";
import { ShopifyApiError } from "@/lib/shopify/client";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

/**
 * Coupon Drop pool orchestration — the glue between the Node-side Shopify
 * Discount API (discounts.ts) and the SQL pool lifecycle RPCs (0045). Runs
 * server-side only, off the request path via `after()` / cron.
 *
 * Lifecycle for a coupon_drop campaign on activation:
 *   1. Resolve the tenant's Shopify client; guard the `write_discounts` scope.
 *   2. Create ONE parent discount (the merchant's rule) → set_parent(gid,'minting').
 *   3. Generate `pool_target` unique codes, bulk-add to Shopify in chunks, and
 *      persist each accepted chunk to the pool (idempotent).
 *   4. set_status('ready'). On any failure → set_status('error', message) so the
 *      merchant sees actionable guidance and the play engine falls back to
 *      internal codes (customers still win).
 *
 * Top-up refills a low pool the same way against the EXISTING parent discount.
 */

const SHOPIFY_BULK_CHUNK = 100;

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

interface PoolCounts {
  available: number;
  claimed: number;
  total: number;
  pool_target: number;
  pool_low_watermark: number;
  pool_status: string;
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

async function poolCounts(
  businessId: string,
  campaignId: string
): Promise<PoolCounts | null> {
  const { data, error } = await adminClient().rpc("coupon_pool_counts", {
    p_business_id: businessId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(`coupon_pool_counts failed: ${error.message}`);
  const row = Array.isArray(data) ? (data[0] as PoolCounts | undefined) : (data as PoolCounts | null);
  return row ?? null;
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

function toDiscountConfig(cfg: CouponConfigRow): DiscountConfig {
  return {
    discountType: cfg.discount_type ?? "percentage",
    discountValue: Number(cfg.discount_value ?? 0),
    minimumSubtotal: cfg.minimum_subtotal,
    usageLimit: cfg.usage_limit,
    appliesOncePerCustomer: cfg.applies_once_per_customer,
    currency: cfg.currency,
    scopeProductIds: cfg.scope_product_ids ?? [],
    scopeCollectionIds: cfg.scope_collection_ids ?? [],
  };
}

/**
 * Mint (or extend) the pool for a campaign to reach `pool_target`. `parentGid`
 * is the parent discount to attach codes to. Returns the number of codes added.
 *
 * Each chunk is bulk-added to Shopify, then the async job is POLLED so we persist
 * ONLY codes Shopify confirmed created — capturing each code's redeem-code GID
 * (shopify_redeem_code_id). Unconfirmed/failed codes are never written to the
 * pool, so a partially-failed job can't seed checkout-invalid codes; the
 * watermark top-up path naturally refills any shortfall.
 */
async function mintCodes(
  businessId: string,
  campaignId: string,
  parentGid: string,
  count: number
): Promise<number> {
  if (count <= 0) return 0;
  const shopify = await getShopifyForBusiness(businessId);
  if (!shopify) throw new ShopifyDiscountError("Shopify not connected");

  const codes = generatePoolCodes(campaignId.slice(0, 4).toUpperCase() || "SAVE", count);
  let added = 0;
  for (const part of chunk(codes, SHOPIFY_BULK_CHUNK)) {
    const bulkId = await bulkAddCodes(shopify.client, parentGid, part);
    if (!bulkId) continue;

    const result = await pollBulkCreation(shopify.client, bulkId);
    if (result.codes.length === 0) continue; // nothing confirmed → skip persist

    const { data, error } = await adminClient().rpc("coupon_pool_add_codes", {
      p_business_id: businessId,
      p_campaign_id: campaignId,
      p_parent_gid: parentGid,
      p_codes: result.codes.map((c) => ({
        code: c.code,
        shopify_redeem_code_id: c.redeemId,
      })),
    });
    if (error) throw new Error(`coupon_pool_add_codes failed: ${error.message}`);
    added += typeof data === "number" ? data : 0;
  }
  return added;
}

/**
 * Full pool activation on campaign go-live: create the parent discount, then
 * mint the target number of unique codes. Idempotent-ish: if a parent already
 * exists we reuse it and just top up. Records error status on failure so the
 * merchant is guided to reconnect / fix scope.
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
    if (!cfg.discount_type || !cfg.discount_value) {
      await setStatus(businessId, campaignId, "error", "Discount type and value are required.");
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

    // Create the parent discount if we don't already have one.
    let parentGid = cfg.shopify_parent_discount_id;
    if (!parentGid) {
      const placeholder = generatePoolCodes("PARENT", 1)[0];
      parentGid = await createParentDiscount(
        shopify.client,
        `Coupon Drop ${campaignId.slice(0, 8)}`,
        toDiscountConfig(cfg),
        placeholder
      );
      const { error } = await adminClient().rpc("coupon_config_set_parent", {
        p_business_id: businessId,
        p_campaign_id: campaignId,
        p_parent_gid: parentGid,
        p_pool_status: "minting",
      });
      if (error) throw new Error(`coupon_config_set_parent failed: ${error.message}`);
    } else {
      await setStatus(businessId, campaignId, "minting");
    }

    const counts = await poolCounts(businessId, campaignId);
    const target = counts?.pool_target ?? cfg.pool_target ?? 500;
    const existing = counts?.available ?? 0;
    const toMint = Math.max(0, target - existing);
    const added = await mintCodes(businessId, campaignId, parentGid, toMint);

    await setStatus(businessId, campaignId, "ready");
    log.info("coupon_drop.pool_ready", { added, target });
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
 * Refill a campaign's pool if it has dropped at/below its low watermark. Safe to
 * call opportunistically on every coupon_drop win — it no-ops when the pool is
 * healthy or not ready.
 */
export async function topUpPoolIfLow(
  businessId: string,
  campaignId: string
): Promise<void> {
  const log = createLogger(newCorrelationId(), {
    route: "coupon-drop.topup",
    businessId,
    campaignId,
  });
  try {
    const cfg = await loadConfig(businessId, campaignId);
    if (!cfg || !cfg.shopify_parent_discount_id) return;

    const counts = await poolCounts(businessId, campaignId);
    if (!counts) return;
    if (counts.available > counts.pool_low_watermark) return;

    const shopify = await getShopifyForBusiness(businessId);
    if (!shopify) return;
    if (!hasWriteDiscounts(shopify.shop.scopes)) {
      const check = await ensureWriteDiscounts(businessId, shopify.shop.scopes);
      if (!check.ok) return;
    }

    const toMint = Math.max(0, counts.pool_target - counts.available);
    if (toMint <= 0) return;

    await setStatus(businessId, campaignId, "minting");
    const added = await mintCodes(
      businessId,
      campaignId,
      cfg.shopify_parent_discount_id,
      toMint
    );
    await setStatus(businessId, campaignId, "ready");
    log.info("coupon_drop.topped_up", { added });
  } catch (err) {
    const message = errorMessage(err);
    log.error("coupon_drop.topup_failed", { err: message });
    try {
      await setStatus(businessId, campaignId, "error", message.slice(0, 500));
    } catch {
      // best effort
    }
  }
}

/**
 * Daily cron sweep: top up every active coupon_drop campaign whose pool is low.
 * Serial to stay within Shopify rate limits and Vercel Hobby time budgets.
 */
export async function topUpAllCouponDropPools(): Promise<{ swept: number }> {
  const { data, error } = await adminClient().rpc("coupon_drop_campaigns_for_topup");
  if (error) throw new Error(`coupon_drop_campaigns_for_topup failed: ${error.message}`);
  const rows = (data as Array<{ business_id: string; campaign_id: string }>) ?? [];
  for (const row of rows) {
    await topUpPoolIfLow(row.business_id, row.campaign_id);
  }
  return { swept: rows.length };
}

/**
 * Opportunistic top-up keyed only by campaign — resolves the owning business
 * from the config row. Used on the play win path where only the campaign_id is
 * known. No-ops silently if the campaign has no coupon config.
 */
export async function topUpPoolForCampaign(campaignId: string): Promise<void> {
  const { data, error } = await adminClient()
    .from("campaign_coupon_configs")
    .select("business_id")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error || !data) return;
  await topUpPoolIfLow((data as { business_id: string }).business_id, campaignId);
}

function errorMessage(err: unknown): string {
  if (err instanceof ShopifyDiscountError) return err.message;
  if (err instanceof ShopifyApiError) {
    if (err.isAuthError) return "Shopify authorization failed. Reconnect your store.";
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
