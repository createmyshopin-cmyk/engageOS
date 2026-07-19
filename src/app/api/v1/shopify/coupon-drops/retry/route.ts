import { defineRoute } from "@/server/http/handler";
import { ShopifyReadController } from "@/server/modules/shopify/read-controller";

export const runtime = "nodejs";

/**
 * POST /api/v1/shopify/coupon-drops/retry — re-run Coupon Drop parent-discount
 * setup for campaigns stuck in pool_status=error. Body: { campaignId?: string }.
 */
export const POST = defineRoute({
  auth: true,
  handler: async ({ ctx, req }) => {
    const body = (await req.json().catch(() => ({}))) as { campaignId?: string };
    return new ShopifyReadController(ctx).retryCouponDrops(body);
  },
});
