"use client";

/**
 * React Query hook for the Marketing read model (`/api/v1/marketing/broadcasts`).
 *
 * The ONLY sanctioned client data path for the marketing broadcast feed —
 * components never fetch or hit the DB directly. Keyset infinite pagination over
 * the opaque cursor; tenancy is enforced server-side by the v1 auth guard (no
 * business id sent). Read-only: there is no send/launch mutation here — the send
 * composer lives under `/m/wati`.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type { BroadcastListItemDTO } from "@/lib/api/types";

export const marketingKeys = {
  all: ["marketing"] as const,
  broadcasts: () => [...marketingKeys.all, "broadcasts"] as const,
};

const PAGE_LIMIT = 25;

/** Infinite, keyset-paginated marketing broadcast list, newest-first. */
export function useBroadcastList() {
  return useInfiniteQuery({
    queryKey: marketingKeys.broadcasts(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<BroadcastListItemDTO[]>(
        `/api/v1/marketing/broadcasts${buildQuery({
          limit: PAGE_LIMIT,
          cursor: pageParam,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<BroadcastListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single broadcast array. */
export function flattenBroadcastPages(
  pages: ApiResult<BroadcastListItemDTO[]>[] | undefined
): BroadcastListItemDTO[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
