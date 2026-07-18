import { defineRoute } from "@/server/http/handler";
import { ShopifyReadController } from "@/server/modules/shopify/read-controller";

export const runtime = "nodejs";

/**
 * POST /api/v1/shopify/scopes/refresh — force a fresh Shopify token exchange so
 * scopes the merchant enabled AFTER connecting are recognized without waiting for
 * the 24h token to expire. A Dev Dashboard app's existing token keeps its
 * original scope set until re-issued; this re-exchanges immediately and returns
 * the reconciled granted scopes. Mutating (rotates the cached token) → write
 * scope. Tenant derived from the session, never input.
 */
export const POST = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifyReadController(ctx).refreshScopes(),
});
