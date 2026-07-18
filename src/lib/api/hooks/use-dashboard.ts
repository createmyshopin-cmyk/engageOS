"use client";

/**
 * React Query hooks for the merchant dashboard: analytics overview + campaigns.
 *
 * These wrap the v1 endpoints built in Phase 1:
 *   GET /api/v1/analytics/overview  → KPI snapshot (event-sourced aggregate)
 *   GET /api/v1/campaigns           → keyset campaign list with per-campaign stats
 *
 * The `/m/dashboard` page itself remains RSC-first (server-rendered at first
 * paint, per the HYBRID data-fetch decision) — these hooks exist so client
 * islands can refresh KPIs / page through campaigns without a full reload, and
 * so the v1 contract is consumable end-to-end. No direct fetch, no DB access;
 * tenancy is derived server-side from the session cookie.
 */

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type { AnalyticsOverviewDTO, CampaignListItemDTO } from "@/lib/api/types";

// ── Query keys ──

export const dashboardKeys = {
  all: ["dashboard"] as const,
  overview: () => [...dashboardKeys.all, "overview"] as const,
};

export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  list: (status: string | null) => [...campaignKeys.lists(), { status }] as const,
};

const PAGE_LIMIT = 25;

// ── Analytics overview (KPI snapshot) ──

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: ({ signal }) =>
      apiClient.get<AnalyticsOverviewDTO>("/api/v1/analytics/overview", signal),
    select: (r) => r.data,
  });
}

// ── Campaigns (infinite / keyset, with per-campaign stats) ──

export function useCampaignList(status: string | null = null) {
  return useInfiniteQuery({
    queryKey: campaignKeys.list(status),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<CampaignListItemDTO[]>(
        `/api/v1/campaigns${buildQuery({
          limit: PAGE_LIMIT,
          cursor: pageParam,
          status,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<CampaignListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single campaign array. */
export function flattenCampaignPages(
  pages: ApiResult<CampaignListItemDTO[]>[] | undefined
): CampaignListItemDTO[] {
  return (pages ?? []).flatMap((p) => p.data);
}
