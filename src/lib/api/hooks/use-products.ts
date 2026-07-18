"use client";

/**
 * React Query hooks for the Products read model (`/api/v1/products`).
 *
 * The ONLY sanctioned client data path for catalog views. Keyset infinite
 * pagination with optional search; tenancy enforced server-side.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type { ProductListItemDTO } from "@/lib/api/types";

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (search: string) => [...productKeys.lists(), { search }] as const,
};

const PAGE_LIMIT = 24;

/** Infinite, keyset-paginated product list with optional free-text search. */
export function useProductList(search: string) {
  return useInfiniteQuery({
    queryKey: productKeys.list(search),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<ProductListItemDTO[]>(
        `/api/v1/products${buildQuery({
          limit: PAGE_LIMIT,
          search: search || null,
          cursor: pageParam,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<ProductListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single product array. */
export function flattenProductPages(
  pages: ApiResult<ProductListItemDTO[]>[] | undefined
): ProductListItemDTO[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
