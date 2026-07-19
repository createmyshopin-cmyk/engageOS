import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyLeaderboardQuery } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/**
 * GET /api/v1/loyalty/leaderboard — top paying customers.
 *
 * Ranked by total_spend from the precomputed customer_analytics rollup.
 * Tenant is derived from the authenticated session.
 */
export const GET = defineRoute({
  auth: true,
  query: loyaltyLeaderboardQuery,
  handler: ({ ctx, query }) =>
    new LoyaltyController(ctx).leaderboard(query.limit, query.offset),
});
