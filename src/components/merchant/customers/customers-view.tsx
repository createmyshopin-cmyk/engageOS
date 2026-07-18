"use client";

/**
 * CustomersView — the interactive client island for `/m/customers`.
 *
 * Owns the customer list experience: debounced search, keyset infinite scroll,
 * loading / empty / error states, and selecting a row to open the detail
 * drawer. All data flows through the `use-customers` React Query hooks against
 * `/api/v1/customers` — no direct fetch, no DB access. Tenancy is enforced
 * server-side by the v1 auth guard; this component never sends a business id.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Users, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  useCustomerList,
  flattenCustomerPages,
} from "@/lib/api/hooks/use-customers";
import type { CustomerListItemDTO } from "@/lib/api/types";
import { CustomerDetailDrawer } from "@/components/merchant/customers/customer-detail-drawer";

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initials(name: string | null): string {
  if (!name) return "CU";
  return name.trim().slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CustomersView() {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  } = useCustomerList(search);

  const customers = flattenCustomerPages(data?.pages);

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
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Customers</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Every customer across your campaigns, unified in one profile.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Search name, phone, or email…"
            className="w-full pl-9 pr-9 py-2.5 text-xs bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 transition"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
          {isFetching && !isFetchingNextPage && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-emerald-500 animate-spin" />
          )}
        </div>
      </header>

      {/* Body */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState message={error instanceof Error ? error.message : "Failed to load customers."} onRetry={refetch} />
        ) : customers.length === 0 ? (
          <EmptyState searching={!!search} />
        ) : (
          <>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100 text-[9px] uppercase tracking-wider text-neutral-400 font-black bg-neutral-50/50">
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-3 hidden sm:table-cell">Phone</th>
                  <th className="py-3 px-3 hidden md:table-cell">Email</th>
                  <th className="py-3 px-5 text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: CustomerListItemDTO) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="border-b border-neutral-50 last:border-0 hover:bg-emerald-50/30 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-8 rounded-xl bg-neutral-100 text-neutral-700 text-[10px] font-black shrink-0">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">{c.name || "Customer"}</p>
                          <p className="text-[10px] text-neutral-400 font-semibold sm:hidden">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-neutral-700 hidden sm:table-cell">{c.phone}</td>
                    <td className="py-3 px-3 text-xs text-neutral-500 hidden md:table-cell truncate max-w-[200px]">
                      {c.email || "—"}
                    </td>
                    <td className="py-3 px-5 text-right text-[11px] font-semibold text-neutral-500">
                      {formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
                  {customers.length} customer{customers.length === 1 ? "" : "s"} · end of list
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && (
        <CustomerDetailDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

/* ── States ── */

function ListSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5 px-5 animate-pulse">
          <div className="size-8 rounded-xl bg-neutral-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-32 bg-neutral-100 rounded" />
            <div className="h-2 w-20 bg-neutral-100 rounded" />
          </div>
          <div className="h-2 w-16 bg-neutral-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Users className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">
        {searching ? "No matching customers" : "No customers yet"}
      </h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        {searching
          ? "Try a different name, phone number, or email."
          : "Customers appear here as they join your campaigns."}
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
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load customers</h3>
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
