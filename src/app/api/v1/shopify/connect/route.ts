import { defineRoute } from "@/server/http/handler";
import { ShopifyConnectionController } from "@/server/modules/shopify/connection/controller";
import { connectShopifyBody } from "@/server/modules/shopify/connection/validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Connect exchanges the client credentials for a token against the live Shopify
// API and registers webhooks inline, so allow headroom for those round-trips.
export const maxDuration = 60;

/**
 * Shopify connect — /api/v1/shopify/connect
 *
 * POST → connect the tenant's store from merchant-supplied DEV DASHBOARD
 * credentials (shop domain + Client ID + Client Secret). The credentials are
 * exchanged for a short-lived token against the live Shopify API, encrypted
 * before storage, webhooks are registered, and an initial sync is enqueued.
 *
 * Owner/manager only. Tenant is derived from the authenticated session — the
 * client never sends a business id, and credentials are never echoed back.
 */
export const POST = defineRoute({
  auth: true,
  body: connectShopifyBody,
  handler: ({ ctx, body }) => new ShopifyConnectionController(ctx).connect(body),
});
