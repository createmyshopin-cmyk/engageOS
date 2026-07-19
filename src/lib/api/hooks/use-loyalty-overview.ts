"use client";

/**
 * React Query hook for loyalty dashboard KPIs.
 *
 * GET /api/v1/loyalty/overview → members, tiers, revenue, repeat rate.
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LoyaltyOverviewDTO } from "@/lib/api/types";

export const loyaltyKeys = {
  all: ["loyalty"] as const,
  overview: () => [...loyaltyKeys.all, "overview"] as const,
  leaderboard: (limit: number, offset: number) =>
    [...loyaltyKeys.all, "leaderboard", limit, offset] as const,
  detail: (customerId: string) => [...loyaltyKeys.all, customerId] as const,
};

export function useLoyaltyOverview() {
  return useQuery({
    queryKey: loyaltyKeys.overview(),
    queryFn: ({ signal }) =>
      apiClient.get<LoyaltyOverviewDTO>("/api/v1/loyalty/overview", signal),
    select: (r) => r.data,
  });
}
