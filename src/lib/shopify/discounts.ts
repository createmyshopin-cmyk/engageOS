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

const BULK_CREATION_QUERY = `
  query couponDropBulkStatus($id: ID!, $first: Int!, $after: String) {
    discountRedeemCodeBulkCreation(id: $id) {
      done
      codesCount
      failedCount
      codes(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          code
          errors { code message }
          discountRedeemCode { id }
        }
      }
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
 * 100 codes per bulk call, so callers should chunk. Returns the async
 * `bulkCreation` job id (poll it with pollBulkCreation to confirm codes were
 * actually created and to capture per-code Shopify ids); returns null on an
 * empty input. Throws ShopifyDiscountError on userErrors.
 */
export async function bulkAddCodes(
  client: ShopifyClient,
  parentGid: string,
  codes: string[]
): Promise<string | null> {
  if (codes.length === 0) return null;
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
  return data.discountRedeemCodeBulkAdd?.bulkCreation?.id ?? null;
}

/** A code confirmed created in Shopify, with its per-code redeem-code GID. */
export interface ConfirmedCode {
  code: string;
  redeemId: string | null;
}

export interface BulkCreationResult {
  done: boolean;
  failedCount: number;
  codes: ConfirmedCode[];
}

/**
 * Poll a discountRedeemCodeBulkAdd job until it reports done (bounded retries).
 * Returns the codes Shopify actually created (paginated) with their redeem-code
 * ids, plus the job's done/failed status. Codes that errored are omitted from
 * `codes`, so callers persist ONLY confirmed codes. Never throws on an
 * incomplete job — it returns done=false and whatever codes are available so
 * the caller can persist the confirmed subset and let top-up refill the rest.
 */
export async function pollBulkCreation(
  client: ShopifyClient,
  bulkCreationId: string,
  opts: { maxPolls?: number; delayMs?: number; pageSize?: number } = {}
): Promise<BulkCreationResult> {
  const maxPolls = opts.maxPolls ?? 10;
  const delayMs = opts.delayMs ?? 1500;
  const pageSize = opts.pageSize ?? 100;

  let done = false;
  let failedCount = 0;

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const data = await client.graphql<{
      discountRedeemCodeBulkCreation?: {
        done?: boolean;
        failedCount?: number;
      } | null;
    }>(BULK_CREATION_QUERY, { id: bulkCreationId, first: 1, after: null });

    const node = data.discountRedeemCodeBulkCreation;
    done = node?.done === true;
    failedCount = Number(node?.failedCount ?? 0);
    if (done) break;
    await sleep(delayMs);
  }

  // Collect confirmed codes (paginate the codes connection).
  const codes: ConfirmedCode[] = [];
  let after: string | null = null;
  do {
    const data: {
      discountRedeemCodeBulkCreation?: {
        codes?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{
            code?: string;
            errors?: Array<{ code?: string; message?: string }>;
            discountRedeemCode?: { id?: string } | null;
          }>;
        };
      } | null;
    } = await client.graphql(BULK_CREATION_QUERY, {
      id: bulkCreationId,
      first: pageSize,
      after,
    });

    const conn = data.discountRedeemCodeBulkCreation?.codes;
    for (const n of conn?.nodes ?? []) {
      const hasError = (n.errors?.length ?? 0) > 0;
      const code = n.code?.trim();
      if (!code || hasError) continue;
      codes.push({ code, redeemId: n.discountRedeemCode?.id ?? null });
    }
    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor ?? null : null;
  } while (after);

  return { done, failedCount, codes };
}

/** Promise-based delay (app runtime; not a workflow script). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
