"use client";

/**
 * ActivityView — the interactive client island for `/m/activity`.
 *
 * A business-wide, newest-first stream of every durable CDP event: orders,
 * loyalty, campaigns, communication, profile changes, and more. Owns category
 * filtering and keyset infinite scroll, with loading / empty / error states.
 *
 * All data flows through the `use-events` React Query hook against
 * `/api/v1/events` — no direct fetch, no DB access. Tenancy is enforced
 * server-side by the v1 auth guard; this component never sends a business id.
 *
 * Presentation reuses the canonical event helpers (`eventMeta`, `timeAgo`) from
 * the campaign timeline so every event renders consistently across the app.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useEventFeed, flattenEventPages } from "@/lib/api/hooks/use-events";
import { EVENT_CATEGORIES, type EventCategory, type EventDTO } from "@/lib/api/types";
import { eventMeta, timeAgo } from "@/components/merchant/campaign-events-timeline";

const CATEGORY_LABEL: Record<EventCategory, string> = {
  commerce: "Commerce",
  loyalty: "Loyalty",
  campaign: "Campaign",
  communication: "Messaging",
  profile: "Profile",
  marketing: "Marketing",
  system: "System",
  ai: "AI",
};

/** Best-effort one-line detail from an event's free-form payload. */
function detailFor(payload: Record<string, unknown>): string | null {
  const pick = (k: string) =>
    typeof payload[k] === "string" ? (payload[k] as string) : null;
  return (
    pick("customerName") ??
    pick("name") ??
    pick("title") ??
    pick("couponCode") ??
    pick("orderNumber") ??
    null
  );
}

export function ActivityView() {
  const [category, setCategory] = useState<EventCategory | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useEventFeed({ category });

  const events = flattenEventPages(data?.pages);

  // Infinite scroll — observe a sentinel at the list bottom.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Activity</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Everything happening across your business, as it happens.
          </p>
        </div>
        {isFetching && !isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <FilterPill active={category === null} onClick={() => setCategory(null)}>
          All
        </FilterPill>
        {EVENT_CATEGORIES.map((c) => (
          <FilterPill key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </FilterPill>
        ))}
      </div>

      {/* Body */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <FeedSkeleton />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load activity."}
            onRetry={refetch}
          />
        ) : events.length === 0 ? (
          <EmptyState filtered={category !== null} />
        ) : (
          <>
            <ol className="divide-y divide-neutral-50">
              {events.map((e: EventDTO) => {
                const m = eventMeta(e.name);
                const Icon = m.icon;
                const detail = detailFor(e.payload);
                return (
                  <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div
                      className={`flex items-center justify-center size-8 rounded-xl shrink-0 ${m.tone}`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-neutral-900 leading-tight">
                        {m.label}
                        {detail && (
                          <span className="font-medium text-neutral-500"> · {detail}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium">
                        {CATEGORY_LABEL[e.category as EventCategory] ?? e.category} ·{" "}
                        {e.source} · {timeAgo(e.occurredAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* Infinite-scroll sentinel + status */}
            <div ref={sentinelRef} className="py-4 flex items-center justify-center">
              {isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
                  <Loader2 className="size-3.5 animate-spin" /> Loading more…
                </span>
              ) : hasNextPage ? (
                <button
                  onClick={() => fetchNextPage()}
                  className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
                >
                  Load more
                </button>
              ) : (
                <span className="text-[10px] font-semibold text-neutral-300">
                  {events.length} event{events.length === 1 ? "" : "s"} · end of stream
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Filter pill ── */

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
        active
          ? "bg-neutral-900 text-white"
          : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

/* ── States ── */

function FeedSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3.5 px-5 animate-pulse">
          <div className="size-8 rounded-xl bg-neutral-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-40 bg-neutral-100 rounded" />
            <div className="h-2 w-24 bg-neutral-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Activity className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">
        {filtered ? "No activity in this category" : "No activity yet"}
      </h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        {filtered
          ? "Try a different category, or switch back to All."
          : "Events appear here as customers scan, play, redeem, and shop."}
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-7 text-red-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load activity</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">{message}</p>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
