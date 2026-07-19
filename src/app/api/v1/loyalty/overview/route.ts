import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/loyalty/overview — loyalty dashboard KPIs.
 *
 * Aggregates customer_analytics for the tenant: members, active count,
 * tier distribution, repeat purchase rate, and loyalty revenue. Points
 * issued/redeemed return 0 until the Phase 2 ledger ships.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new LoyaltyController(ctx).overview(),
});
