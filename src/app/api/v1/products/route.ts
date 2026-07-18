import { defineRoute, NotImplementedError } from "@/server";

/**
 * Products module — /api/v1/products
 *
 * SCAFFOLD. Read model over `shopify_products` (and future catalog sources).
 * Products are WRITTEN by ingestion, not created here.
 *
 * Tenancy: scoped by business_id; keyset-paginated.
 *
 * Planned surface:
 *   GET /api/v1/products              → list (cursor, search by title/sku)
 *   GET /api/v1/products/:id          → detail
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("products.list is not implemented yet");
  },
});
