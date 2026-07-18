import { defineRoute } from "@/server/http/handler";
import { ShopifySyncController } from "@/server/modules/shopify/sync/controller";

export const runtime = "nodejs";

/**
 * Shopify connection health — /api/v1/shopify/sync/health
 *
 * A lightweight snapshot (connected flag, shop domain, 24h webhook throughput,
 * any active job, last error) for the dashboard header and status polling.
 * Read scope; tenant derived from the session.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifySyncController(ctx).health(),
});
