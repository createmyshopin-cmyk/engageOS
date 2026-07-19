"use client";

/**
 * React Query hooks for the Customers domain (`/api/v1/customers*`).
 *
 * This is the ONLY sanctioned client data path for customer views. Components
 * never call `fetch` or the DB directly — they use these hooks, which wrap the
 * typed `apiClient` and centralize query keys, keyset pagination, and cache
 * invalidation. Server Components that need customer data at first paint still
 * use the DAL (TenantRepository); these hooks power the interactive client
 * views (infinite list, search, optimistic tag/consent).
 *
 * Endpoints are all REAL today (verified in the v1 audit):
 *   GET    /api/v1/customers                 → list (keyset)
 *   GET    /api/v1/customers/:id             → profile
 *   GET    /api/v1/customers/:id/360         → 360 bundle
 *   GET    /api/v1/customers/:id/timeline    → keyset timeline (pages by `before`)
 *   POST   /api/v1/customers                 → upsert
 *   POST   /api/v1/customers/:id/consent     → set consent
 *   POST   /api/v1/customers/:id/tags        → add tag
 *   DELETE /api/v1/customers/:id             → soft-delete
 *   POST   /api/v1/customers/merge           → merge
 */

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type {
  CustomerListItemDTO,
  CustomerDTO,
  Customer360DTO,
  TimelineEntryDTO,
} from "@/lib/api/types";

// ── Query keys (single source of truth for cache invalidation) ──

export type CustomerRewardFilter = "all" | "has_code" | "active" | "redeemed" | "no_reward";
export type CustomerJoinedFilter = "all" | "7d" | "30d" | "90d";

export interface CustomerListFilters {
  search?: string;
  rewardFilter?: CustomerRewardFilter;
  joined?: CustomerJoinedFilter;
  joinedFrom?: string | null;
  joinedTo?: string | null;
}

function buildFilterQuery(filters: CustomerListFilters) {
  const search = filters.search?.trim() ?? "";
  const rewardFilter = filters.rewardFilter ?? "all";
  const joined = filters.joined;
  const joinedFrom = filters.joinedFrom?.trim() || null;
  const joinedTo = filters.joinedTo?.trim() || null;

  return {
    search: search || null,
    rewardFilter: rewardFilter === "all" ? null : rewardFilter,
    joined: joinedFrom || joinedTo ? null : joined && joined !== "all" ? joined : null,
    joinedFrom,
    joinedTo,
  };
}

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (filters: CustomerListFilters) => [...customerKeys.lists(), filters] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
  profile360: (id: string) => [...customerKeys.detail(id), "360"] as const,
  timeline: (id: string) => [...customerKeys.detail(id), "timeline"] as const,
};

const PAGE_LIMIT = 25;

// ── List (infinite / keyset) ──

/**
 * Infinite, keyset-paginated customer list with search + filters.
 * `pageParam` is the opaque `nextCursor` from the previous page.
 */
export function useCustomerList(filters: CustomerListFilters = {}) {
  const search = filters.search?.trim() ?? "";
  const rewardFilter = filters.rewardFilter ?? "all";
  const joined = filters.joined ?? "all";
  const joinedFrom = filters.joinedFrom ?? null;
  const joinedTo = filters.joinedTo ?? null;
  const normalized: CustomerListFilters = { search, rewardFilter, joined, joinedFrom, joinedTo };

  return useInfiniteQuery({
    queryKey: customerKeys.list(normalized),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<CustomerListItemDTO[]>(
        `/api/v1/customers${buildQuery({
          limit: PAGE_LIMIT,
          cursor: pageParam,
          ...buildFilterQuery(normalized),
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<CustomerListItemDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single customer array. */
export function flattenCustomerPages(
  pages: ApiResult<CustomerListItemDTO[]>[] | undefined
): CustomerListItemDTO[] {
  return (pages ?? []).flatMap((p) => p.data);
}

export type CustomerExportFormat = "csv" | "xlsx";

/** Download customers matching the current filters as CSV or Excel. */
export async function exportCustomers(
  filters: CustomerListFilters = {},
  format: CustomerExportFormat = "csv"
): Promise<void> {
  const normalized: CustomerListFilters = {
    search: filters.search?.trim() ?? "",
    rewardFilter: filters.rewardFilter ?? "all",
    joined: filters.joined ?? "all",
    joinedFrom: filters.joinedFrom ?? null,
    joinedTo: filters.joinedTo ?? null,
  };
  const qs = buildQuery({ ...buildFilterQuery(normalized), format });

  const res = await fetch(`/api/v1/customers/export${qs}`, { credentials: "same-origin" });
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
  const fallbackExt = format === "xlsx" ? "xlsx" : "csv";
  const filename =
    match?.[1] ?? `campaign-customers-${new Date().toISOString().slice(0, 10)}.${fallbackExt}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** @deprecated Use exportCustomers(filters, "csv") */
export async function exportCustomersCsv(filters: CustomerListFilters = {}): Promise<void> {
  return exportCustomers(filters, "csv");
}

// ── Single customer / profile / 360 ──

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: id ? customerKeys.detail(id) : customerKeys.details(),
    enabled: !!id,
    queryFn: ({ signal }) => apiClient.get<CustomerDTO>(`/api/v1/customers/${id}`, signal),
    select: (r) => r.data,
  });
}

export function useCustomer360(id: string | null) {
  return useQuery({
    queryKey: id ? customerKeys.profile360(id) : customerKeys.details(),
    enabled: !!id,
    queryFn: ({ signal }) =>
      apiClient.get<Customer360DTO>(`/api/v1/customers/${id}/360`, signal),
    select: (r) => r.data,
  });
}

// ── Timeline (infinite; pages by `before` ts) ──

export function useCustomerTimeline(id: string | null) {
  return useInfiniteQuery({
    queryKey: id ? customerKeys.timeline(id) : customerKeys.details(),
    enabled: !!id,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<TimelineEntryDTO[]>(
        `/api/v1/customers/${id}/timeline${buildQuery({
          limit: PAGE_LIMIT,
          before: pageParam,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<TimelineEntryDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

export function flattenTimelinePages(
  pages: ApiResult<TimelineEntryDTO[]>[] | undefined
): TimelineEntryDTO[] {
  return (pages ?? []).flatMap((p) => p.data);
}

// ── Mutations ──

export interface UpsertCustomerInput {
  phone: string;
  name?: string;
  email?: string;
  gender?: string;
  birthday?: string;
  anniversary?: string;
  language?: string;
  timezone?: string;
  source?: string;
}

export function useUpsertCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertCustomerInput) =>
      apiClient.post<CustomerDTO>("/api/v1/customers", input),
    onSuccess: (res) => {
      // New/updated customer changes list ordering and its own detail.
      qc.invalidateQueries({ queryKey: customerKeys.lists() });
      qc.setQueryData(customerKeys.detail(res.data.id), res);
    },
  });
}

export interface SetConsentInput {
  channel: "whatsapp" | "email" | "sms" | "push";
  status: "granted" | "revoked";
  source?: string;
}

export function useSetConsent(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetConsentInput) =>
      apiClient.post<CustomerDTO>(`/api/v1/customers/${customerId}/consent`, input),
    onSuccess: (res) => {
      qc.setQueryData(customerKeys.detail(customerId), res);
    },
  });
}

export interface AddTagInput {
  name: string;
  color?: string;
}

export function useAddTag(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddTagInput) =>
      apiClient.post<{ tagId: string }>(`/api/v1/customers/${customerId}/tags`, input),
    onSuccess: () => {
      // Tags surface in the 360 bundle.
      qc.invalidateQueries({ queryKey: customerKeys.profile360(customerId) });
    },
  });
}
