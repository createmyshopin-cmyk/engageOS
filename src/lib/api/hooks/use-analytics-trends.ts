"use client";

/**
 * React Query hook for the merchant analytics trends chart.
 *
 *   GET /api/v1/analytics/trends?days=7 → { days, series[] }
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { AnalyticsTrendsDTO } from "@/lib/api/types";
import { analyticsKeys } from "@/lib/api/hooks/use-analytics";

export function useAnalyticsTrends(days: number) {
  return useQuery({
    queryKey: [...analyticsKeys.all, "trends", days] as const,
    queryFn: ({ signal }) =>
      apiClient.get<AnalyticsTrendsDTO>(`/api/v1/analytics/trends?days=${days}`, signal),
    select: (r) => r.data,
  });
}
