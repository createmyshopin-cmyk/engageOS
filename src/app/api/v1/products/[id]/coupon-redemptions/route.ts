import { defineRoute } from "@/server/http/handler";
import { ProductController } from "@/server/modules/products/controller";
import { productIdParam } from "@/server/modules/products/validator";

export const runtime = "nodejs";

/** GET /api/v1/products/:id/coupon-redemptions — full redemption history for one product. */
export const GET = defineRoute({
  auth: true,
  params: productIdParam,
  handler: ({ ctx, params }) => new ProductController(ctx).couponRedemptions(params.id),
});
