import { defineRoute } from "@/server/http/handler";
import { ShopifyConnectionController } from "@/server/modules/shopify/connection/controller";
import { connectShopifyBody } from "@/server/modules/shopify/connection/validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Connect validates the token against the live Shopify API and registers
// webhooks inline, so allow headroom for those round-trips.
export const maxDuration = 60;

/**
 * Shopify connect — /api/v1/shopify/connect
 *
 * POST → connect the tenant's store from merchant-supplied CUSTOM-APP
 * credentials (shop domain + Admin API access token + API secret key). The
 * token is validated against the live Shopify API, both secrets are encrypted
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
