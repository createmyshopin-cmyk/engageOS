import { defineRoute } from "@/server/http/handler";
import { ShopifyReadController } from "@/server/modules/shopify/read-controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/shopify/overview — connection status + ingestion totals.
 *
 * Read-only window onto data the Shopify webhook pipeline already ingested
 * (shopify_shops + orders + shopify_products). There is no connect/OAuth
 * surface here (D4); store installation is handled out of band. Tenant is
 * derived from the authenticated session, never from the client.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifyReadController(ctx).overview(),
});
