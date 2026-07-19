import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyHistoryQuery, loyaltyParam } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/**
 * GET /api/v1/loyalty/wallet/:customerId/history — points transaction log.
 */
export const GET = defineRoute({
  auth: true,
  params: loyaltyParam,
  query: loyaltyHistoryQuery,
  handler: ({ ctx, params, query }) =>
    new LoyaltyController(ctx).pointsHistory(params.customerId, query.limit, query.offset),
});
