"use client";

/**
 * React Query hooks for the Winners domain (`/api/v1/winners*`).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient, buildQuery } from "@/lib/api/client";
import type {
  WinnerListFilters,
  WinnerListItemDTO,
  WinnersSummaryDTO,
} from "@/lib/api/types";
import {
  wonDateToApi,
  type WonDateValue,
} from "@/components/merchant/winners/winners-date-filter";

export const winnerKeys = {
  all: ["winners"] as const,
  lists: () => [...winnerKeys.all, "list"] as const,
  list: (filters: WinnerListFilters & { page: number; limit: number }) =>
    [...winnerKeys.lists(), filters] as const,
  summaries: () => [...winnerKeys.all, "summary"] as const,
  summary: (wonFrom: string | null, wonTo: string | null) =>
    [...winnerKeys.summaries(), { wonFrom, wonTo }] as const,
};

function buildFilterQuery(filters: WinnerListFilters) {
  return {
    search: filters.search?.trim() || null,
    prizeCategory: filters.prizeCategory && filters.prizeCategory !== "all" ? filters.prizeCategory : null,
    campaignId: filters.campaignId || null,
    campaignScope:
      filters.campaignScope && filters.campaignScope !== "eligible" ? filters.campaignScope : null,
    wonFrom: filters.wonFrom || null,
    wonTo: filters.wonTo || null,
  };
}

export { wonDateToApi };

export function useWinnersList(
  filters: WinnerListFilters,
  page: number,
  limit: number
) {
  const normalized: WinnerListFilters = {
    search: filters.search?.trim() ?? "",
    prizeCategory: filters.prizeCategory ?? "all",
    campaignId: filters.campaignId ?? null,
    campaignScope: filters.campaignScope ?? "eligible",
    wonFrom: filters.wonFrom ?? null,
    wonTo: filters.wonTo ?? null,
  };

  return useQuery({
    queryKey: winnerKeys.list({ ...normalized, page, limit }),
    queryFn: ({ signal }) =>
      apiClient.get<WinnerListItemDTO[]>(
        `/api/v1/winners${buildQuery({
          page,
          limit,
          ...buildFilterQuery(normalized),
        })}`,
        signal
      ),
    placeholderData: keepPreviousData,
  });
}

export function useWinnersSummary(wonFrom: string | null, wonTo: string | null) {
  return useQuery({
    queryKey: winnerKeys.summary(wonFrom, wonTo),
    queryFn: ({ signal }) =>
      apiClient.get<WinnersSummaryDTO>(
        `/api/v1/winners/summary${buildQuery({ wonFrom, wonTo })}`,
        signal
      ),
    select: (r) => r.data,
    placeholderData: keepPreviousData,
  });
}

export async function exportWinners(filters: WinnerListFilters = {}): Promise<void> {
  const qs = buildQuery(buildFilterQuery(filters));
  const res = await fetch(`/api/v1/winners/export${qs}`, { credentials: "same-origin" });
  if (!res.ok) {
    let message = "Export failed";
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `winners-${new Date().toISOString().slice(0, 10)}.csv`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type { WonDateValue };
