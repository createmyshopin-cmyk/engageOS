import { defineRoute } from "@/server/http/handler";
import { ShopifyReadController } from "@/server/modules/shopify/read-controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/shopify/scopes — live granted Admin API scopes for the tenant's
 * store, read from Shopify (access_scopes.json) with a fallback to the scopes
 * stored at connect time. The access token never leaves the server; only scope
 * handle strings are returned. Tenant derived from the session, never input.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifyReadController(ctx).scopes(),
});
