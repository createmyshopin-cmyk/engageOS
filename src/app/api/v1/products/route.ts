import { defineRoute } from "@/server/http/handler";
import { ProductController } from "@/server/modules/products/controller";
import { listProductsQuery } from "@/server/modules/products/validator";

export const runtime = "nodejs";

/**
 * Products module — /api/v1/products
 *
 * Read model over `shopify_products`. Products are WRITTEN by ingestion, not
 * created here. Tenancy derived from the authenticated session; keyset-
 * paginated over (created_at, id) with optional title/handle/vendor search.
 *
 * GET /api/v1/products → list (cursor, search, status filter)
 */
export const GET = defineRoute({
  auth: true,
  query: listProductsQuery,
  handler: ({ ctx, query }) => new ProductController(ctx).list(query),
});
