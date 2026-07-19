"use client";

/**
 * React Query hook for the top-paying-customers leaderboard.
 *
 * GET /api/v1/loyalty/leaderboard?limit&offset
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LoyaltyLeaderboardItemDTO } from "@/lib/api/types";
import { loyaltyKeys } from "@/lib/api/hooks/use-loyalty-overview";

export function useLoyaltyLeaderboard(opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  return useQuery({
    queryKey: loyaltyKeys.leaderboard(limit, offset),
    queryFn: ({ signal }) =>
      apiClient.get<LoyaltyLeaderboardItemDTO[]>(
        `/api/v1/loyalty/leaderboard?limit=${limit}&offset=${offset}`,
        signal
      ),
    select: (r) => r.data,
  });
}
