"use client";

/**
 * React Query hooks for the universal event stream (`/api/v1/events`).
 *
 * The event feed is the CDP backbone: a business-wide, keyset-paginated,
 * newest-first stream of every durable event (commerce, loyalty, campaign,
 * communication, …). This hook powers the merchant Activity page — the only
 * sanctioned client path to that feed. Components never call `fetch` or the DB
 * directly; they use this hook, which wraps the typed `apiClient` and centralizes
 * query keys + keyset pagination.
 *
 * Endpoint (REAL — verified in the v1 audit):
 *   GET /api/v1/events  → keyset feed, opaque `cursor` → `page.nextCursor`,
 *                         filterable by `category` / `name` / `customerId`.
 *
 * NOTE: unlike the customer timeline (which pages by a raw `before` timestamp),
 * the event feed uses OPAQUE encoded cursors. We pass `page.nextCursor` straight
 * back as `cursor` — never parse or synthesize it client-side.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient, buildQuery, type ApiResult } from "@/lib/api/client";
import type { EventDTO, EventCategory } from "@/lib/api/types";

// ── Query keys (single source of truth for cache invalidation) ──

export interface EventFeedFilters {
  category?: EventCategory | null;
  name?: string | null;
  customerId?: string | null;
}

export const eventKeys = {
  all: ["events"] as const,
  feeds: () => [...eventKeys.all, "feed"] as const,
  feed: (filters: EventFeedFilters) => [...eventKeys.feeds(), filters] as const,
};

const PAGE_LIMIT = 25;

/**
 * Infinite, keyset-paginated event feed with optional category/name/customer
 * filters. `pageParam` is the opaque `nextCursor` from the previous page.
 */
export function useEventFeed(filters: EventFeedFilters = {}) {
  return useInfiniteQuery({
    queryKey: eventKeys.feed(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<EventDTO[]>(
        `/api/v1/events${buildQuery({
          limit: PAGE_LIMIT,
          cursor: pageParam,
          category: filters.category ?? null,
          name: filters.name ?? null,
          customerId: filters.customerId ?? null,
        })}`,
        signal
      ),
    getNextPageParam: (last: ApiResult<EventDTO[]>) =>
      last.page?.hasMore ? last.page.nextCursor : undefined,
  });
}

/** Flatten infinite-query pages into a single event array. */
export function flattenEventPages(
  pages: ApiResult<EventDTO[]>[] | undefined
): EventDTO[] {
  return (pages ?? []).flatMap((p) => p.data);
}
