import "server-only";
import type { ShopifyClient } from "@/lib/shopify/client";

/**
 * Shopify Discount API orchestration (GraphQL Admin API). Pure functions over a
 * resolved ShopifyClient — no tenant resolution, no DB. The orchestrator
 * (coupon-drop-orchestrator.ts) wires these to the pool RPCs.
 *
 * Model: ONE parent "basic code" discount holds the RULE (percentage/amount,
 * minimums, scope, usage caps). Unique per-customer codes are then bulk-attached
 * to that parent via discountRedeemCodeBulkAdd. Requires the `write_discounts`
 * access scope; a token without it fails with a userError we surface upward.
 */

/** Merchant-configured discount rules mirrored from campaign_coupon_configs. */
export interface DiscountConfig {
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  minimumSubtotal?: number | null;
  usageLimit?: number | null;
  appliesOncePerCustomer?: boolean;
  currency?: string | null;
  /** Shopify product GIDs the discount is limited to (empty = order-wide). */
  scopeProductIds?: string[];
  /** Shopify collection GIDs the discount is limited to (empty = order-wide). */
  scopeCollectionIds?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
}

export class ShopifyDiscountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyDiscountError";
  }
}

const CREATE_PARENT_MUTATION = `
  mutation couponDropCreateParent($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const BULK_ADD_MUTATION = `
  mutation couponDropBulkAdd($discountId: ID!, $codes: [DiscountRedeemCodeInput!]!) {
    discountRedeemCodeBulkAdd(discountId: $discountId, codes: $codes) {
      bulkCreation { id }
      userErrors { field message }
    }
  }
`;

/**
 * Create the parent discount (the rule). A single placeholder code is required
 * by the API; the real per-customer codes are bulk-added afterward and this
 * placeholder is effectively unused. Returns the parent discount GID.
 */
export async function createParentDiscount(
  client: ShopifyClient,
  title: string,
  config: DiscountConfig,
  placeholderCode: string
): Promise<string> {
  const customerGets: Record<string, unknown> = {
    value:
      config.discountType === "percentage"
        ? { percentage: clampPercentage(config.discountValue) }
        : {
            discountAmount: {
              amount: String(config.discountValue),
              appliesOnEachItem: false,
            },
          },
    items: buildItems(config),
  };

  const basicCodeDiscount: Record<string, unknown> = {
    title,
    code: placeholderCode,
    startsAt: config.startsAt ?? new Date().toISOString(),
    customerSelection: { all: true },
    customerGets,
    appliesOncePerCustomer: config.appliesOncePerCustomer ?? false,
  };
  if (config.endsAt) basicCodeDiscount.endsAt = config.endsAt;
  if (config.usageLimit && config.usageLimit > 0) {
    basicCodeDiscount.usageLimit = config.usageLimit;
  }
  if (config.minimumSubtotal && config.minimumSubtotal > 0) {
    basicCodeDiscount.minimumRequirement = {
      subtotal: { greaterThanOrEqualToSubtotal: String(config.minimumSubtotal) },
    };
  }

  const data = await client.graphql<{
    discountCodeBasicCreate?: {
      codeDiscountNode?: { id?: string } | null;
      userErrors?: Array<{ field?: string[]; message?: string }>;
    };
  }>(CREATE_PARENT_MUTATION, { basicCodeDiscount });

  const result = data.discountCodeBasicCreate;
  const errors = result?.userErrors ?? [];
  if (errors.length > 0) {
    throw new ShopifyDiscountError(
      errors.map((e) => e.message ?? "unknown").join("; ")
    );
  }
  const gid = result?.codeDiscountNode?.id;
  if (!gid) {
    throw new ShopifyDiscountError("discountCodeBasicCreate returned no discount id");
  }
  return gid;
}

/**
 * Bulk-attach unique redeem codes to a parent discount. Shopify accepts up to
 * 100 codes per bulk call, so callers should chunk. Returns nothing on success;
 * throws ShopifyDiscountError on userErrors.
 */
export async function bulkAddCodes(
  client: ShopifyClient,
  parentGid: string,
  codes: string[]
): Promise<void> {
  if (codes.length === 0) return;
  const data = await client.graphql<{
    discountRedeemCodeBulkAdd?: {
      bulkCreation?: { id?: string } | null;
      userErrors?: Array<{ field?: string[]; message?: string }>;
    };
  }>(BULK_ADD_MUTATION, {
    discountId: parentGid,
    codes: codes.map((code) => ({ code })),
  });

  const errors = data.discountRedeemCodeBulkAdd?.userErrors ?? [];
  if (errors.length > 0) {
    throw new ShopifyDiscountError(
      errors.map((e) => e.message ?? "unknown").join("; ")
    );
  }
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Generate `n` unique human-typable codes of the form PREFIX-XXXXXX (base32,
 * no ambiguous chars). Uniqueness within the batch is guaranteed by a Set; the
 * DB unique(campaign_id, code) constraint is the final backstop across batches.
 */
export function generatePoolCodes(prefix: string, n: number): string[] {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I,L,O,0,1
  const clean = (prefix || "SAVE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "SAVE";
  const out = new Set<string>();
  while (out.size < n) {
    let suffix = "";
    for (let i = 0; i < 8; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    out.add(`${clean}-${suffix}`);
  }
  return Array.from(out);
}

/** Shopify percentages are a fraction (0.10 == 10%); clamp to [0,1]. */
function clampPercentage(value: number): number {
  const fraction = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, fraction));
}

/** Build the customerGets.items selector — scoped products/collections or all. */
function buildItems(config: DiscountConfig): Record<string, unknown> {
  const products = config.scopeProductIds ?? [];
  const collections = config.scopeCollectionIds ?? [];
  if (products.length === 0 && collections.length === 0) {
    return { all: true };
  }
  const items: Record<string, unknown> = {};
  if (products.length > 0) {
    items.products = { productsToAdd: products };
  }
  if (collections.length > 0) {
    items.collections = { add: collections };
  }
  return items;
}
