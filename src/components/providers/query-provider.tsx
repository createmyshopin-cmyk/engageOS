"use client";

/**
 * QueryProvider — the single React Query boundary for the merchant dashboard.
 *
 * Per the integration plan's HYBRID data-fetch decision (D1): Server Components
 * keep fetching through the Data Access Layer (TenantRepository) for initial
 * page loads, while NEW client-interactive views (infinite-scroll customer
 * list, optimistic tag/consent, live timeline) use React Query against the
 * `/api/v1` HTTP API. This provider is mounted once inside `MerchantShell`, so
 * every `/m` page gets a client cache without rewriting a single page.
 *
 * The QueryClient is created lazily in `useState` so it is stable across
 * re-renders and never shared between requests/users (each browser tab/session
 * gets its own instance). Defaults are tuned for a dashboard: data is
 * considered fresh for 30s to avoid refetch storms on navigation, and we don't
 * refetch on window focus (merchants tab away constantly).
 */

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from "@tanstack/react-query";

const CONFIG: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient(CONFIG));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
