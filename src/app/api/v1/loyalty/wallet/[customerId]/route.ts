import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyParam } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/**
 * GET /api/v1/loyalty/wallet/:customerId — customer points wallet snapshot.
 */
export const GET = defineRoute({
  auth: true,
  params: loyaltyParam,
  handler: ({ ctx, params }) => new LoyaltyController(ctx).wallet(params.customerId),
});
