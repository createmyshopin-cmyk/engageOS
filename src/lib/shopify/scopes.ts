/**
 * The Shopify Admin API scopes EngageOS requests. Mostly read-only for the sync
 * engine (one per resource it pulls); `write_discounts` is the sole write scope,
 * required so Coupon Drop campaigns can mint unique discount codes.
 *
 * Shared by the connect instructions (client) and the granted/missing scope
 * comparison on /m/shopify. No "server-only" guard — this is a plain constant
 * with no secrets, safe to import into client components.
 */

export interface RequiredScope {
  handle: string;
  for: string;
  /** True for the write scope Coupon Drop depends on. */
  write?: boolean;
}

export const REQUIRED_SHOPIFY_SCOPES: RequiredScope[] = [
  { handle: "read_products", for: "Products" },
  { handle: "read_orders", for: "Orders" },
  { handle: "read_customers", for: "Customers" },
  { handle: "read_inventory", for: "Inventory levels" },
  { handle: "read_locations", for: "Store locations (inventory)" },
  { handle: "read_price_rules", for: "Discounts / price rules" },
  { handle: "read_discounts", for: "Discount codes" },
  { handle: "write_discounts", for: "Coupon Drop discount codes", write: true },
];

/** Parse a Shopify scope string ("a,b, c") into a trimmed handle set. */
export function parseScopes(scopes: string | null | undefined): Set<string> {
  if (!scopes) return new Set();
  return new Set(
    scopes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Expand a granted scope set to include the reads that Shopify IMPLIES from
 * writes. Shopify's access_scopes.json omits `read_x` when `write_x` is granted
 * ("the read access scope is omitted because it's implied by the write access
 * scope"), so an exact-string membership check would wrongly flag `read_discounts`
 * as missing on a token that holds `write_discounts`. We add the implied `read_x`
 * for every `write_x` present so the granted/missing comparison matches reality.
 */
export function expandImpliedScopes(granted: Set<string>): Set<string> {
  const out = new Set(granted);
  for (const handle of granted) {
    if (handle.startsWith("write_")) {
      out.add(`read_${handle.slice("write_".length)}`);
    }
  }
  return out;
}

/**
 * True when `handle` is effectively granted by `scopes`, honoring write-implies-
 * read. Accepts a raw scope string or a pre-parsed set. Use this everywhere a
 * required scope is checked so display and enforcement agree.
 */
export function isScopeGranted(
  handle: string,
  scopes: string | null | undefined | Set<string>
): boolean {
  const set = scopes instanceof Set ? scopes : parseScopes(scopes);
  return expandImpliedScopes(set).has(handle);
}
