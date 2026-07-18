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
import type { ShopifyClient } from "@/lib/shopify/client";
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

async function poolCounts(
  businessId: string,
  campaignId: string,
  prizeId?: string
): Promise<PoolCounts | null> {
  const { data, error } = await adminClient().rpc("coupon_pool_counts", {
    p_business_id: businessId,
    p_campaign_id: campaignId,
    p_prize_id: prizeId ?? null,
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
 * Mint (or extend) the pool for ONE tier of a campaign by `count` codes.
 * `parentGid` is the tier's parent discount to attach codes to; `prizeId` tags
 * each pooled code so play_campaign can claim a code matching the won tier.
 * Returns the number of codes added.
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
  prizeId: string,
  parentGid: string,
  count: number,
  prefix: string
): Promise<number> {
  if (count <= 0) return 0;
  const shopify = await getShopifyForBusiness(businessId);
  if (!shopify) throw new ShopifyDiscountError("Shopify not connected");

  const codes = generatePoolCodes(prefix, count);
  let added = 0;
  for (const part of chunk(codes, SHOPIFY_BULK_CHUNK)) {
    const bulkId = await bulkAddCodes(shopify.client, parentGid, part);
    if (!bulkId) continue;

    const result = await pollBulkCreation(shopify.client, bulkId);
    if (result.codes.length === 0) continue; // nothing confirmed → skip persist

    const { data, error } = await adminClient().rpc("coupon_pool_add_codes", {
      p_business_id: businessId,
      p_campaign_id: campaignId,
      p_prize_id: prizeId,
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

/** Short, tier-distinct code prefix, e.g. "AB12P10" for a 10% tier. */
function tierPrefix(campaignId: string, tier: CouponTier): string {
  const base = (campaignId.replace(/-/g, "").slice(0, 4).toUpperCase() || "SAVE");
  const mark = tier.discount_type === "percentage" ? "P" : "F";
  return `${base}${mark}${Math.round(tier.discount_value)}`.slice(0, 10);
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

    let totalAdded = 0;
    let firstParentGid: string | null = cfg.shopify_parent_discount_id;
    for (const tier of tiers) {
      const added = await activateTier(businessId, campaignId, cfg, tier, shopify.client, log);
      totalAdded += added.count;
      firstParentGid ??= added.parentGid;
    }

    // Keep the config's parent pointer populated (used as the "activated" flag by
    // the top-up paths). Point it at the first tier's parent for continuity.
    if (firstParentGid && firstParentGid !== cfg.shopify_parent_discount_id) {
      const { error } = await adminClient().rpc("coupon_config_set_parent", {
        p_business_id: businessId,
        p_campaign_id: campaignId,
        p_parent_gid: firstParentGid,
        p_pool_status: "minting",
      });
      if (error) throw new Error(`coupon_config_set_parent failed: ${error.message}`);
    }

    await setStatus(businessId, campaignId, "ready");
    log.info("coupon_drop.pool_ready", { added: totalAdded, tiers: tiers.length });
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

/** Per-tier target: enough codes for the tier's whole stock (falls back to the
 * campaign pool_target for unlimited-stock tiers). */
function tierTarget(cfg: CouponConfigRow, tier: CouponTier): number {
  return tier.total_quantity > 0 ? tier.total_quantity : (cfg.pool_target ?? 500);
}

/**
 * Create/reuse one tier's parent discount and mint its pool up to the tier
 * target. Returns the parent GID and the number of codes added. Throws on hard
 * failure so the caller records an error status for the whole campaign.
 */
async function activateTier(
  businessId: string,
  campaignId: string,
  cfg: CouponConfigRow,
  tier: CouponTier,
  client: ShopifyClient,
  log: ReturnType<typeof createLogger>
): Promise<{ parentGid: string; count: number }> {
  let parentGid = tier.shopify_parent_discount_id;
  if (!parentGid) {
    const pct =
      tier.discount_type === "percentage"
        ? `${tier.discount_value}%`
        : `${cfg.currency ?? "INR"} ${tier.discount_value}`;
    const placeholder = generatePoolCodes("PARENT", 1)[0];
    parentGid = await createParentDiscount(
      client,
      `Coupon Drop ${tier.name} (${pct}) ${campaignId.slice(0, 8)}`,
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
  }

  const target = tierTarget(cfg, tier);
  const counts = await poolCounts(businessId, campaignId, tier.prize_id);
  const existing = counts?.available ?? 0;
  const toMint = Math.max(0, target - existing);
  const count = await mintCodes(
    businessId,
    campaignId,
    tier.prize_id,
    parentGid,
    toMint,
    tierPrefix(campaignId, tier)
  );
  log.info("coupon_drop.tier_minted", {
    prizeId: tier.prize_id,
    tier: tier.name,
    added: count,
    target,
  });
  return { parentGid, count };
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

    const tiers = await loadTiers(campaignId, cfg);
    // Only tiers whose parent has already been created are eligible for top-up;
    // a tier still missing a parent hasn't been activated yet.
    const active = tiers.filter((t) => t.shopify_parent_discount_id);
    if (active.length === 0) return;

    // Any tier at/below the watermark triggers a top-up pass.
    const lowTiers: Array<{ tier: CouponTier; toMint: number }> = [];
    for (const tier of active) {
      const counts = await poolCounts(businessId, campaignId, tier.prize_id);
      if (!counts) continue;
      if (counts.available > counts.pool_low_watermark) continue;
      const toMint = Math.max(0, tierTarget(cfg, tier) - counts.available);
      if (toMint > 0) lowTiers.push({ tier, toMint });
    }
    if (lowTiers.length === 0) return;

    const shopify = await getShopifyForBusiness(businessId);
    if (!shopify) return;
    if (!hasWriteDiscounts(shopify.shop.scopes)) {
      const check = await ensureWriteDiscounts(businessId, shopify.shop.scopes);
      if (!check.ok) return;
    }

    await setStatus(businessId, campaignId, "minting");
    let added = 0;
    for (const { tier, toMint } of lowTiers) {
      added += await mintCodes(
        businessId,
        campaignId,
        tier.prize_id,
        tier.shopify_parent_discount_id!,
        toMint,
        tierPrefix(campaignId, tier)
      );
    }
    await setStatus(businessId, campaignId, "ready");
    log.info("coupon_drop.topped_up", { added, tiers: lowTiers.length });
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
