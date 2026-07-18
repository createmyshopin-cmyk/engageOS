import { defineRoute } from "@/server/http/handler";
import { AnalyticsController } from "@/server/modules/analytics/controller";

export const runtime = "nodejs";

/**
 * GET /api/v1/analytics/overview — merchant dashboard KPI snapshot.
 *
 * Served entirely by the `business_event_totals` aggregate RPC over the
 * immutable event log (DB-side, tenant-scoped). Read scope. Additional planned
 * surfaces (timeseries, funnel, cohorts) remain to be built on the same module.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new AnalyticsController(ctx).overview(),
});
