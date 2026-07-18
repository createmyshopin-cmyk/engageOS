"use client";

/**
 * React Query hooks for the Shopify surface (`/api/v1/shopify/*`).
 *
 * Two layers live here:
 *   - The read-only OVERVIEW (`/overview`) — connection status + ingestion
 *     totals the webhook pipeline already landed. No connect/OAuth mutation.
 *   - The SYNC control surface (`/sync`, `/sync/health`, `/sync/jobs`) — the
 *     operational engine's dashboard + manual/selective trigger + disconnect.
 *
 * Components never call `fetch` or hit the DB directly; they use these hooks,
 * which wrap the typed `apiClient` and centralize query keys + invalidation. The
 * client NEVER sends a tenant id — the v1 guard derives it from the session.
 *
 * OAuth install is deliberately NOT a mutation here: connecting a store is a
 * top-level browser navigation to `/api/shopify/install` (it redirects to
 * Shopify), so the UI links to it rather than fetching it.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, type ApiResult } from "@/lib/api/client";
import type {
  ShopifyOverviewDTO,
  ShopifyConnectionHealthDTO,
  ShopifySyncOverviewDTO,
  ShopifySyncJobDTO,
  ShopifyTriggerResultDTO,
} from "@/lib/api/types";

export const shopifyKeys = {
  all: ["shopify"] as const,
  overview: () => [...shopifyKeys.all, "overview"] as const,
  sync: () => [...shopifyKeys.all, "sync"] as const,
  syncHealth: () => [...shopifyKeys.all, "sync", "health"] as const,
  syncJobs: (limit: number) => [...shopifyKeys.all, "sync", "jobs", limit] as const,
};

/** Connection status + ingested order/product/revenue totals (read model). */
export function useShopifyOverview() {
  return useQuery({
    queryKey: shopifyKeys.overview(),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifyOverviewDTO>("/api/v1/shopify/overview", signal),
    select: (r: ApiResult<ShopifyOverviewDTO>) => r.data,
  });
}

/**
 * Full sync dashboard bundle (health + per-resource state + recent jobs).
 * Polls while a sync is running so progress ticks live without a manual refresh.
 */
export function useShopifySync(options?: { poll?: boolean }) {
  return useQuery({
    queryKey: shopifyKeys.sync(),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifySyncOverviewDTO>("/api/v1/shopify/sync", signal),
    select: (r: ApiResult<ShopifySyncOverviewDTO>) => r.data,
    // While a job is active, refetch every few seconds for live progress.
    refetchInterval: (query) => {
      if (options?.poll === false) return false;
      const data = query.state.data as ApiResult<ShopifySyncOverviewDTO> | undefined;
      return data?.data.health.activeJob ? 4000 : false;
    },
  });
}

/** Lightweight connection-health snapshot (header / status polling). */
export function useShopifyHealth() {
  return useQuery({
    queryKey: shopifyKeys.syncHealth(),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifyConnectionHealthDTO>("/api/v1/shopify/sync/health", signal),
    select: (r: ApiResult<ShopifyConnectionHealthDTO>) => r.data,
  });
}

/** Recent sync-job history (logs), newest first. */
export function useShopifySyncJobs(limit = 20) {
  return useQuery({
    queryKey: shopifyKeys.syncJobs(limit),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifySyncJobDTO[]>(`/api/v1/shopify/sync/jobs?limit=${limit}`, signal),
    select: (r: ApiResult<ShopifySyncJobDTO[]>) => r.data,
  });
}

export interface TriggerSyncInput {
  /** Omit to sync every resource; pass a subset for a selective/partial sync. */
  resources?: string[];
  mode?: "manual" | "incremental";
}

/** Trigger a manual/incremental sync (full or selective). */
export function useTriggerShopifySync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerSyncInput = {}) =>
      apiClient.post<ShopifyTriggerResultDTO>("/api/v1/shopify/sync", input),
    onSuccess: () => {
      // Jobs are now queued/running — refresh the bundle so progress appears and
      // polling kicks in.
      qc.invalidateQueries({ queryKey: shopifyKeys.sync() });
    },
  });
}

/** Disconnect the connected store (owner/manager). Revokes + drops the token. */
export function useDisconnectShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ disconnected: true }>("/api/v1/shopify/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopifyKeys.all });
    },
  });
}
