"use client";

/**
 * OrdersView — the interactive client island for `/m/orders`.
 *
 * A newest-first, keyset-paginated table of ingested orders where customers
 * used an EngageOS campaign coupon. Defaults to campaign-coupon orders only;
 * merchants can switch to all orders. All data flows through the `use-orders`
 * React Query hook against `/api/v1/orders` — no direct fetch, no DB access.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Store,
  ArrowRight,
  Ticket,
} from "lucide-react";
import {
  useOrderList,
  flattenOrderPages,
  type OrderFeedFilters,
} from "@/lib/api/hooks/use-orders";
import { useShopifyOverview } from "@/lib/api/hooks/use-shopify";
import type { OrderCouponFilter, OrderListItemDTO } from "@/lib/api/types";
import { OrderDetailDrawer } from "@/components/merchant/orders/order-detail-drawer";

const STATUS_FILTERS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Refunded", value: "refunded" },
];

const COUPON_FILTERS: { label: string; value: OrderCouponFilter }[] = [
  { label: "Campaign coupon", value: "with_coupon" },
  { label: "All orders", value: "all" },
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
  const [couponFilter, setCouponFilter] = useState<OrderCouponFilter>("with_coupon");
  const [selectedOrder, setSelectedOrder] = useState<OrderListItemDTO | null>(null);

  const shopify = useShopifyOverview();
  const shopifyConnected = shopify.data?.connected ?? false;

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
  } = useOrderList({ status, couponFilter } satisfies OrderFeedFilters);

  const orders = flattenOrderPages(data?.pages);
  const shopifyLoading = shopify.isLoading;
  const hasActiveFilters = status !== null || couponFilter !== "with_coupon";

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
            Orders where customers used your EngageOS campaign coupon codes.
          </p>
        </div>
        {isFetching && !isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {!shopifyLoading && !shopifyConnected && <ConnectShopifyBanner />}

      <div className="flex flex-wrap gap-2">
        {COUPON_FILTERS.map((f) => (
          <FilterPill
            key={f.value}
            active={couponFilter === f.value}
            onClick={() => setCouponFilter(f.value)}
          >
            {f.label}
          </FilterPill>
        ))}
      </div>

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
        {isLoading || shopifyLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load orders."}
            onRetry={refetch}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            filtered={hasActiveFilters}
            shopifyConnected={shopifyConnected}
            couponFilter={couponFilter}
          />
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_1.1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
              <span>Order</span>
              <span>Customer</span>
              <span>Coupon</span>
              <span className="text-right">Total</span>
              <span className="text-right">Placed</span>
            </div>
            <ol className="divide-y divide-neutral-50">
              {orders.map((o: OrderListItemDTO) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(o)}
                    className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1.1fr_1fr_auto_auto] gap-x-4 gap-y-1 items-center px-5 py-3.5 text-left hover:bg-neutral-50/80 transition cursor-pointer"
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
                    <div className="min-w-0 hidden sm:block">
                      {o.discountCode ? (
                        <>
                          <p className="inline-flex items-center gap-1 text-[10px] font-bold font-mono text-violet-700 truncate">
                            <Ticket className="size-3 shrink-0" />
                            {o.discountCode}
                          </p>
                          {o.campaignName && (
                            <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                              {o.campaignName}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-neutral-300">—</span>
                      )}
                    </div>
                    <p className="text-xs font-black text-neutral-900 text-right whitespace-nowrap">
                      {money(o.totalPrice, o.currency)}
                    </p>
                    <p className="text-[11px] font-semibold text-neutral-400 text-right whitespace-nowrap">
                      {shortDate(o.placedAt)}
                    </p>
                  </button>
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

      <OrderDetailDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
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

function ConnectShopifyBanner() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-center justify-center size-11 rounded-2xl bg-emerald-100 text-emerald-600 shrink-0">
          <Store className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-neutral-900">Connect Shopify to see orders</p>
          <p className="text-[11px] font-semibold text-neutral-600 mt-0.5">
            Link your store and EngageOS will sync orders automatically — new ones arrive via
            webhooks, and past orders are backfilled on first connect.
          </p>
        </div>
      </div>
      <Link
        href="/m/shopify"
        className="inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition shrink-0"
      >
        Connect store <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function EmptyState({
  filtered,
  shopifyConnected,
  couponFilter,
}: {
  filtered: boolean;
  shopifyConnected: boolean;
  couponFilter: OrderCouponFilter;
}) {
  if (!filtered && !shopifyConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
        <div className="size-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
          <Store className="size-7 text-emerald-400" />
        </div>
        <h3 className="font-black text-neutral-900 text-sm">Connect your Shopify store</h3>
        <p className="text-xs text-neutral-500 max-w-sm mt-1">
          Orders from your store will show up here once Shopify is connected. You&apos;ll need your
          Dev Dashboard app&apos;s Client ID and Client Secret.
        </p>
        <Link
          href="/m/shopify"
          className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition"
        >
          Go to Shopify setup <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  const message =
    couponFilter === "with_coupon" && !filtered
      ? {
          title: "No campaign coupon orders yet",
          body: "When a customer checks out with an EngageOS campaign coupon code, the order will appear here with the code used.",
        }
      : filtered
        ? {
            title: "No orders match your filters",
            body: "Try a different status or switch to all orders.",
          }
        : {
            title: "No orders yet",
            body: "Orders will appear here once your store syncs them from Shopify.",
          };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        {couponFilter === "with_coupon" ? (
          <Ticket className="size-7 text-violet-300" />
        ) : (
          <ShoppingBag className="size-7 text-neutral-300" />
        )}
      </div>
      <h3 className="font-black text-neutral-900 text-sm">{message.title}</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">{message.body}</p>
      {!filtered && shopifyConnected && (
        <Link
          href="/m/shopify"
          className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition"
        >
          Check sync status <ArrowRight className="size-3.5" />
        </Link>
      )}
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
