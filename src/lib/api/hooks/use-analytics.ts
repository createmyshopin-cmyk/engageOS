"use client";

/**
 * React Query hook for the merchant analytics performance view (Phase 8).
 *
 *   GET /api/v1/analytics/performance → { campaigns[], sources[] }
 *
 * This complements `useAnalyticsOverview()` (KPI snapshot, in use-dashboard.ts):
 * that hook powers the headline numbers, this one powers the campaign
 * leaderboard + traffic-source breakdown. Both are event-sourced aggregates
 * served through the same v1 controller, backed by the existing
 * campaign_performance / traffic_sources RPCs — no new SQL, no DB access from
 * the client, tenancy derived server-side from the session cookie.
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { AnalyticsPerformanceDTO } from "@/lib/api/types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  performance: () => [...analyticsKeys.all, "performance"] as const,
};

export function useAnalyticsPerformance() {
  return useQuery({
    queryKey: analyticsKeys.performance(),
    queryFn: ({ signal }) =>
      apiClient.get<AnalyticsPerformanceDTO>("/api/v1/analytics/performance", signal),
    select: (r) => r.data,
  });
}
