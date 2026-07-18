import { defineRoute } from "@/server/http/handler";
import { AnalyticsController } from "@/server/modules/analytics/controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/analytics/performance — campaign leaderboard + traffic sources.
 *
 * Reuses the existing tenant aggregate RPCs (campaign_performance,
 * traffic_sources) — no new SQL. Tenant is derived from the authenticated
 * session; every aggregate is business-scoped in the RPC.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new AnalyticsController(ctx).performance(),
});
