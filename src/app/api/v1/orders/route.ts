import { defineRoute } from "@/server/http/handler";
import { OrderController } from "@/server/modules/orders/controller";
import { listOrdersQuery } from "@/server/modules/orders/validator";

export const runtime = "nodejs";

/**
 * Orders module — /api/v1/orders
 *
 * Read model over the `orders` table that the Shopify ingestion pipeline (and
 * future POS/manual sources) land into. Orders are WRITTEN by ingestion
 * services, never created through this API — this surface is read + query only.
 *
 * Tenancy: derived from the authenticated session; every query is keyset-
 * paginated over (placed_at, id).
 *
 * GET /api/v1/orders → list (cursor, filter by financial status / customer)
 */
export const GET = defineRoute({
  auth: true,
  query: listOrdersQuery,
  handler: ({ ctx, query }) => new OrderController(ctx).list(query),
});
