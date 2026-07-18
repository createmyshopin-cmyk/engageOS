import { defineRoute, NotImplementedError } from "@/server";

/**
 * Orders module — /api/v1/orders
 *
 * SCAFFOLD. Read model over the `orders`/`order_items` tables that the Shopify
 * ingestion pipeline (and future POS/manual sources) land into. Orders are
 * WRITTEN by ingestion services, never created through this API — this surface
 * is read + query only.
 *
 * Tenancy: orders scoped by business_id; every query keyset-paginated.
 *
 * Planned surface:
 *   GET /api/v1/orders                → list (cursor, filter by status/date/customer)
 *   GET /api/v1/orders/:id            → detail incl. line items
 *   GET /api/v1/orders/:id/timeline   → order-scoped event slice
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("orders.list is not implemented yet");
  },
});
