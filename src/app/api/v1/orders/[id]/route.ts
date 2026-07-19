import { defineRoute } from "@/server/http/handler";
import { OrderController } from "@/server/modules/orders/controller";
import { orderIdParam } from "@/server/modules/orders/validator";

export const runtime = "nodejs";

/** GET /api/v1/orders/[id] — order detail with line items and coupon attribution. */
export const GET = defineRoute({
  auth: true,
  params: orderIdParam,
  handler: ({ ctx, params }) => new OrderController(ctx).get(params.id),
});
