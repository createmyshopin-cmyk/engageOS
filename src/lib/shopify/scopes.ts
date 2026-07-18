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
