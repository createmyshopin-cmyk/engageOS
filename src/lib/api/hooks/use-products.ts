"use client";

/**
 * React Query hooks for the Products read model (`/api/v1/products`).
 */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type {
  ProductCouponFilter,
  ProductCouponRedemptionsDTO,
  ProductCouponSummaryDTO,
  ProductListItemDTO,
  ProductNewFilter,
  ProductSort,
  ProductStockFilter,
} from "@/lib/api/types";

export interface ProductListFilters {
  search: string;
  couponFilter: ProductCouponFilter;
  stockFilter: ProductStockFilter;
  newFilter: ProductNewFilter;
  sort: ProductSort;
}

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (filters: ProductListFilters) => [...productKeys.lists(), filters] as const,
  summary: () => [...productKeys.all, "coupon-summary"] as const,
  redemptions: (id: string) => [...productKeys.all, "coupon-redemptions", id] as const,
};

export const DEFAULT_PRODUCT_SORT: ProductSort = "coupon_first";

export const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "coupon_first", label: "Coupon products first" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "stock_first", label: "In stock first" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
  { value: "name_az", label: "Name: A → Z" },
  { value: "name_za", label: "Name: Z → A" },
];

const PAGE_LIMIT = 24;

export function useProductList(filters: ProductListFilters) {
  return useInfiniteQuery({
    queryKey: productKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<ProductListItemDTO[]>(
        `/api/v1/products${buildQuery({
          limit: PAGE_LIMIT,
          search: filters.search || null,
          couponFilter: filters.couponFilter === "all" ? null : filters.couponFilter,
          stockFilter: filters.stockFilter === "all" ? null : filters.stockFilter,
          newFilter: filters.newFilter === "all" ? null : filters.newFilter,
          sort: filters.sort,
          cursor: pageParam,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<ProductListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

export function useProductCouponSummary() {
  return useQuery({
    queryKey: productKeys.summary(),
    queryFn: ({ signal }) =>
      apiClient.get<ProductCouponSummaryDTO>("/api/v1/products/coupon-summary", signal),
    staleTime: 60_000,
  });
}

export function useProductCouponRedemptions(productId: string | null) {
  return useQuery({
    queryKey: productKeys.redemptions(productId ?? ""),
    queryFn: ({ signal }) =>
      apiClient.get<ProductCouponRedemptionsDTO>(
        `/api/v1/products/${productId}/coupon-redemptions`,
        signal
      ),
    enabled: !!productId,
  });
}

export function flattenProductPages(
  pages: ApiResult<ProductListItemDTO[]>[] | undefined
): ProductListItemDTO[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
