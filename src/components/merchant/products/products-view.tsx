"use client";

/**
 * ProductsView — the interactive client island for `/m/products`.
 *
 * A searchable, keyset-paginated catalog grid over ingested Shopify products,
 * with infinite scroll. All data flows through the `use-products` React Query
 * hook against `/api/v1/products` — no direct fetch, no DB access. Catalog is
 * read-only here (ingestion owns writes); tenancy enforced server-side.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Package, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useProductList, flattenProductPages } from "@/lib/api/hooks/use-products";
import type { ProductListItemDTO } from "@/lib/api/types";

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function money(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function ProductsView() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

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
  } = useProductList(debounced);

  const products = flattenProductPages(data?.pages);

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
    const obs = new IntersectionObserver(onIntersect, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Products</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Your catalog, synced from your connected store.
          </p>
        </div>
        {isFetching && !isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-medium placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
        />
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load products."}
          onRetry={refetch}
        />
      ) : products.length === 0 ? (
        <EmptyState filtered={debounced.length > 0} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p: ProductListItemDTO) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden flex flex-col"
              >
                <div className="aspect-square bg-neutral-50 relative">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN hosts are unbounded; next/image remotePatterns isn't configured for them.
                    <img
                      src={p.imageUrl}
                      alt={p.title ?? "Product"}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Package className="size-8 text-neutral-200" />
                    </div>
                  )}
                  {p.status && p.status !== "active" && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-neutral-900/70 text-white text-[9px] font-bold uppercase">
                      {p.status}
                    </span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-xs font-bold text-neutral-900 line-clamp-2 leading-tight">
                    {p.title ?? "Untitled product"}
                  </p>
                  {p.vendor && (
                    <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{p.vendor}</p>
                  )}
                  <p className="text-xs font-black text-neutral-900 mt-auto pt-2">{money(p.price)}</p>
                </div>
              </div>
            ))}
          </div>

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
                {products.length} product{products.length === 1 ? "" : "s"} · end of catalog
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-neutral-200/80 overflow-hidden animate-pulse">
          <div className="aspect-square bg-neutral-100" />
          <div className="p-3 space-y-2">
            <div className="h-2.5 w-full bg-neutral-100 rounded" />
            <div className="h-2.5 w-12 bg-neutral-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Package className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">
        {filtered ? "No products match your search" : "No products yet"}
      </h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        {filtered
          ? "Try a different search term."
          : "Products appear here once your store syncs its catalog."}
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-7 text-red-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load products</h3>
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
