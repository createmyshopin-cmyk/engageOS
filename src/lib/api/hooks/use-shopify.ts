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
 * Connecting a store uses the DEV DASHBOARD model (multi-tenant): the merchant
 * pastes their own Shopify Dev Dashboard app's Client ID + Client Secret, which
 * are POSTed once to `/api/v1/shopify/connect`, exchanged for a short-lived token
 * and encrypted server-side, and never returned. There is no global OAuth app.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient, type ApiResult } from "@/lib/api/client";
import type {
  ShopifyOverviewDTO,
  ShopifyScopesDTO,
  ShopifyCouponDropsDTO,
  ShopifyConnectionHealthDTO,
  ShopifySyncOverviewDTO,
  ShopifySyncJobDTO,
  ShopifyTriggerResultDTO,
} from "@/lib/api/types";

export const shopifyKeys = {
  all: ["shopify"] as const,
  overview: () => [...shopifyKeys.all, "overview"] as const,
  scopes: () => [...shopifyKeys.all, "scopes"] as const,
  couponDrops: () => [...shopifyKeys.all, "coupon-drops"] as const,
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

/** Live granted Admin API scopes for the connected store (granted/missing UI). */
export function useShopifyScopes(enabled = true) {
  return useQuery({
    queryKey: shopifyKeys.scopes(),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifyScopesDTO>("/api/v1/shopify/scopes", signal),
    select: (r: ApiResult<ShopifyScopesDTO>) => r.data,
    enabled,
  });
}

/** Per-campaign Coupon Drop pool overview + sample codes. */
export function useCouponDrops(enabled = true) {
  return useQuery({
    queryKey: shopifyKeys.couponDrops(),
    queryFn: ({ signal }) =>
      apiClient.get<ShopifyCouponDropsDTO>("/api/v1/shopify/coupon-drops", signal),
    select: (r: ApiResult<ShopifyCouponDropsDTO>) => r.data,
    enabled,
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

export interface ConnectShopifyInput {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}

export interface ConnectShopifyResult {
  connected: true;
  shopDomain: string;
  shopName: string;
}

/**
 * Connect a store from merchant-supplied Dev Dashboard credentials (multi-tenant).
 * The Client ID + Client Secret are POSTed once over TLS to the server, which
 * exchanges them for a short-lived token against Shopify, encrypts them, and
 * stores them per-tenant. On success every Shopify query is invalidated so the
 * UI flips to the connected surface.
 */
export function useConnectShopify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectShopifyInput) =>
      apiClient.post<ConnectShopifyResult>("/api/v1/shopify/connect", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopifyKeys.all });
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

/**
 * Force a fresh Shopify token exchange to pick up scopes the merchant enabled
 * AFTER connecting. A Dev Dashboard app's 24h token keeps its original scope set
 * until re-issued, so this re-exchanges immediately and reconciles the stored
 * scopes. On success the scopes + coupon-drop queries are invalidated so the
 * badges and pool state reflect reality.
 */
export function useRefreshShopifyScopes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<ShopifyScopesDTO>("/api/v1/shopify/scopes/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopifyKeys.scopes() });
      qc.invalidateQueries({ queryKey: shopifyKeys.couponDrops() });
    },
  });
}

/** Re-run Coupon Drop Shopify setup for error campaigns (or one campaign). */
export function useRetryCouponDrop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { campaignId?: string } = {}) =>
      apiClient.post<{ retried: string[] }>("/api/v1/shopify/coupon-drops/retry", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shopifyKeys.couponDrops() });
    },
  });
}
