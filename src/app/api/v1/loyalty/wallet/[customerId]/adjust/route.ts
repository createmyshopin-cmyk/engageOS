import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyAdjustBody, loyaltyParam } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/**
 * POST /api/v1/loyalty/wallet/:customerId/adjust — manual points adjustment.
 */
export const POST = defineRoute({
  auth: true,
  params: loyaltyParam,
  body: loyaltyAdjustBody,
  handler: ({ ctx, params, body }) =>
    new LoyaltyController(ctx).adjustPoints(params.customerId, body.delta, body.note ?? null),
});
