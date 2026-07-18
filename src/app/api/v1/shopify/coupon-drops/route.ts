import { defineRoute } from "@/server/http/handler";
import { ShopifyReadController } from "@/server/modules/shopify/read-controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/shopify/coupon-drops — per-campaign Coupon Drop pool overview for
 * the tenant (minted/available/claimed/redeemed + pool status + parent discount
 * id), each with a few sample codes for merchant inspection. Read-only; tenant
 * derived from the authenticated session.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifyReadController(ctx).couponDrops(),
});
