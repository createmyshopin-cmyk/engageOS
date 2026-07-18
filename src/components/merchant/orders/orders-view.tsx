"use client";

/**
 * OrdersView — the interactive client island for `/m/orders`.
 *
 * A newest-first, keyset-paginated table of every ingested order, with a
 * financial-status filter and infinite scroll. All data flows through the
 * `use-orders` React Query hook against `/api/v1/orders` — no direct fetch, no
 * DB access. Orders are read-only here (ingestion owns writes); tenancy is
 * enforced server-side, so this component never sends a business id.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ShoppingBag, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useOrderList, flattenOrderPages, type OrderFeedFilters } from "@/lib/api/hooks/use-orders";
import type { OrderListItemDTO } from "@/lib/api/types";

const STATUS_FILTERS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Refunded", value: "refunded" },
];

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  pending: "bg-amber-50 text-amber-700",
  refunded: "bg-red-50 text-red-700",
  partially_refunded: "bg-orange-50 text-orange-700",
  voided: "bg-neutral-100 text-neutral-500",
};

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function OrdersView() {
  const [status, setStatus] = useState<string | null>(null);

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
  } = useOrderList({ status } satisfies OrderFeedFilters);

  const orders = flattenOrderPages(data?.pages);

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
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Orders</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Every order ingested from your connected store.
          </p>
        </div>
        {isFetching && !isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterPill
            key={f.label}
            active={status === f.value}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </FilterPill>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load orders."}
            onRetry={refetch}
          />
        ) : orders.length === 0 ? (
          <EmptyState filtered={status !== null} />
        ) : (
          <>
            {/* Column header (sm+) */}
            <div className="hidden sm:grid grid-cols-[1fr_1.2fr_auto_auto] gap-4 px-5 py-3 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              <span>Order</span>
              <span>Customer</span>
              <span className="text-right">Total</span>
              <span className="text-right">Placed</span>
            </div>
            <ol className="divide-y divide-neutral-50">
              {orders.map((o: OrderListItemDTO) => (
                <li
                  key={o.id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1.2fr_auto_auto] gap-x-4 gap-y-1 items-center px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 truncate">
                      {o.orderNumber ? `#${o.orderNumber}` : o.id.slice(0, 8)}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        STATUS_TONE[o.financialStatus ?? ""] ?? "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {o.financialStatus ?? "unknown"}
                    </span>
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <p className="text-xs font-semibold text-neutral-700 truncate">
                      {o.customerName ?? o.customerPhone ?? "Guest"}
                    </p>
                    {o.customerName && o.customerPhone && (
                      <p className="text-[10px] text-neutral-400 truncate">{o.customerPhone}</p>
                    )}
                  </div>
                  <p className="text-xs font-black text-neutral-900 text-right whitespace-nowrap">
                    {money(o.totalPrice, o.currency)}
                  </p>
                  <p className="text-[11px] font-semibold text-neutral-400 text-right whitespace-nowrap">
                    {shortDate(o.placedAt)}
                  </p>
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
                  {orders.length} order{orders.length === 1 ? "" : "s"} · end of list
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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

function TableSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-4 animate-pulse">
          <div className="space-y-1.5">
            <div className="h-2.5 w-24 bg-neutral-100 rounded" />
            <div className="h-2 w-16 bg-neutral-100 rounded" />
          </div>
          <div className="h-3 w-16 bg-neutral-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <ShoppingBag className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">
        {filtered ? "No orders with this status" : "No orders yet"}
      </h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        {filtered
          ? "Try a different status filter."
          : "Orders appear here once your store starts sending them in."}
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
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load orders</h3>
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
