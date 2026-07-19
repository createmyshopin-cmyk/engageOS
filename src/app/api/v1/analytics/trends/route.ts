import { defineRoute } from "@/server/http/handler";
import { AnalyticsController } from "@/server/modules/analytics/controller";
import { analyticsTrendsQuery } from "@/server/modules/analytics/validator";

export const runtime = "nodejs";

/**
 * GET /api/v1/analytics/trends — daily activity series for charts.
 *
 * Wraps the existing `business_daily_activity` aggregate RPC (IST buckets,
 * tenant-scoped). Accepts `?days=7|30|90` (default 7, max 90).
 */
export const GET = defineRoute({
  auth: true,
  query: analyticsTrendsQuery,
  handler: ({ ctx, query }) => new AnalyticsController(ctx).trends(query),
});
