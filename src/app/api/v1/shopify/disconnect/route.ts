import { defineRoute } from "@/server/http/handler";
import { ShopifyConnectionController } from "@/server/modules/shopify/connection/controller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shopify disconnect — /api/v1/shopify/disconnect
 *
 * POST → sever the tenant's store connection (revoke + drop the encrypted
 * token). Owner/manager only. Idempotent. Reconnecting is done by re-running the
 * OAuth install flow at /api/shopify/install.
 */
export const POST = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifyConnectionController(ctx).disconnect(),
});
