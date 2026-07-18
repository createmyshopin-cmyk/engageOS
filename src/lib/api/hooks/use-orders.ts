"use client";

/**
 * React Query hooks for the Orders read model (`/api/v1/orders`).
 *
 * The ONLY sanctioned client data path for order views — components never fetch
 * or hit the DB directly. Keyset infinite pagination over the opaque cursor;
 * tenancy is enforced server-side by the v1 auth guard (no business id sent).
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type { OrderListItemDTO } from "@/lib/api/types";

export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (filters: OrderFeedFilters) => [...orderKeys.lists(), filters] as const,
};

export interface OrderFeedFilters {
  status?: string | null;
  customerId?: string | null;
}

const PAGE_LIMIT = 25;

/** Infinite, keyset-paginated order list with optional status/customer filter. */
export function useOrderList(filters: OrderFeedFilters = {}) {
  const status = filters.status ?? null;
  const customerId = filters.customerId ?? null;
  return useInfiniteQuery({
    queryKey: orderKeys.list({ status, customerId }),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<OrderListItemDTO[]>(
        `/api/v1/orders${buildQuery({
          limit: PAGE_LIMIT,
          status,
          customerId,
          cursor: pageParam,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<OrderListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single order array. */
export function flattenOrderPages(
  pages: ApiResult<OrderListItemDTO[]>[] | undefined
): OrderListItemDTO[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
