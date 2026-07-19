import { defineRoute } from "@/server/http/handler";
import { ProductController } from "@/server/modules/products/controller";

export const runtime = "nodejs";

/** GET /api/v1/products/coupon-summary — aggregate coupon redemption stats. */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ProductController(ctx).couponSummary(),
});
