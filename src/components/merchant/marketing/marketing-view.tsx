"use client";

/**
 * MarketingView — the interactive client island for `/m/marketing`.
 *
 * A newest-first, keyset-paginated feed of every marketing broadcast EngageOS
 * has launched, with per-send delivery stats (accepted / sent / delivered /
 * read / failed). All data flows through the `use-marketing` React Query hook
 * against `/api/v1/marketing/broadcasts` — no direct fetch, no DB access.
 *
 * This surface is READ-ONLY: there is no compose/send action here (no send
 * automation in this phase). Launching a broadcast is handed off to the existing
 * WhatsApp composer via a link — the send flow is not duplicated.
 */

import Link from "next/link";
import { useEffect, useRef, useCallback } from "react";
import {
  Megaphone,
  MessageCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { useBroadcastList, flattenBroadcastPages } from "@/lib/api/hooks/use-marketing";
import type { BroadcastListItemDTO } from "@/lib/api/types";

const STATUS_TONE: Record<string, string> = {
  sending: "bg-amber-50 text-amber-700",
  sent: "bg-emerald-50 text-emerald-700",
  delivered: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-blue-50 text-blue-700",
  draft: "bg-neutral-100 text-neutral-500",
  failed: "bg-red-50 text-red-700",
};

const nf = new Intl.NumberFormat("en-IN");

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function segmentLabel(segment: string): string {
  if (segment.startsWith("campaign:")) return "Campaign audience";
  const map: Record<string, string> = {
    all: "All customers",
    winners: "Winners",
    redeemed: "Redeemed",
  };
  return map[segment] ?? segment;
}

export function MarketingView() {
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
  } = useBroadcastList();

  const broadcasts = flattenBroadcastPages(data?.pages);

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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Marketing</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Every broadcast you&apos;ve sent, with live delivery stats.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isFetchingNextPage && (
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
              <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
            </span>
          )}
          <Link
            href="/m/wati"
            className="inline-flex items-center gap-1.5 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition"
          >
            <MessageCircle className="size-3.5" /> New broadcast
          </Link>
        </div>
      </header>

      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load broadcasts."}
            onRetry={refetch}
          />
        ) : broadcasts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <ol className="divide-y divide-neutral-50">
              {broadcasts.map((b: BroadcastListItemDTO) => (
                <li key={b.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-neutral-900 truncate">{b.name}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            STATUS_TONE[b.status] ?? "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-neutral-500 mt-0.5 truncate">
                        {segmentLabel(b.segment)} · {b.templateName}
                        <span className="text-neutral-300"> · </span>
                        WhatsApp
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-neutral-400 whitespace-nowrap shrink-0">
                      {shortDate(b.createdAt)}
                    </span>
                  </div>

                  {/* Delivery funnel */}
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                    <Stat label="Recipients" value={b.totalRecipients} />
                    <Stat label="Sent" value={b.sent} />
                    <Stat label="Delivered" value={b.delivered} tone="text-emerald-600" />
                    <Stat label="Read" value={b.read} tone="text-blue-600" />
                    {b.failed > 0 && <Stat label="Failed" value={b.failed} tone="text-red-600" />}
                  </div>
                </li>
              ))}
            </ol>

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
                  {broadcasts.length} broadcast{broadcasts.length === 1 ? "" : "s"} · end of list
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`text-sm font-black tabular-nums ${tone ?? "text-neutral-900"}`}>
        {nf.format(value)}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-5 py-5 animate-pulse space-y-3">
          <div className="h-3 w-40 bg-neutral-100 rounded" />
          <div className="h-2.5 w-56 bg-neutral-100 rounded" />
          <div className="h-2.5 w-32 bg-neutral-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Megaphone className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">No broadcasts yet</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        Launch your first WhatsApp broadcast to reach a customer segment — it&apos;ll show up here
        with live delivery stats.
      </p>
      <Link
        href="/m/wati"
        className="mt-5 inline-flex items-center gap-1.5 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition"
      >
        Go to WATI <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-7 text-red-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load broadcasts</h3>
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
