"use client";

/**
 * ProductsView — the interactive client island for `/m/products`.
 *
 * A searchable, keyset-paginated catalog grid over ingested Shopify products,
 * with infinite scroll and coupon redemption insights — showing which customers
 * applied EngageOS Shopify discount codes per product.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Package,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Ticket,
  Users,
  ShoppingBag,
  TrendingUp,
  X,
  CheckCircle2,
  AlertCircle,
  Archive,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import {
  useProductList,
  useProductCouponSummary,
  flattenProductPages,
  PRODUCT_SORT_OPTIONS,
  type ProductListFilters,
} from "@/lib/api/hooks/use-products";
import type {
  ProductCouponFilter,
  ProductListItemDTO,
  ProductNewFilter,
  ProductSort,
  ProductStockFilter,
} from "@/lib/api/types";
import { ProductCouponDrawer } from "@/components/merchant/products/product-coupon-drawer";
import { ProductImage } from "@/components/merchant/products/product-image";
import { ProductStockBadge, stockFilterLabel } from "@/components/merchant/products/product-stock-badge";

const STOCK_FILTERS: {
  label: string;
  short: string;
  value: ProductStockFilter;
  icon: typeof CheckCircle2;
}[] = [
  { label: "All stock", short: "All", value: "all", icon: Package },
  { label: "In stock", short: "In stock", value: "in_stock", icon: CheckCircle2 },
  { label: "Low stock", short: "Low", value: "low_stock", icon: AlertCircle },
  { label: "Out of stock", short: "Out", value: "out_of_stock", icon: Archive },
];

const COUPON_FILTERS: {
  label: string;
  short: string;
  value: ProductCouponFilter;
  icon: typeof Package;
}[] = [
  { label: "All products", short: "All", value: "all", icon: Package },
  { label: "Coupon redeemed", short: "With coupon", value: "with_coupon", icon: Ticket },
  { label: "No coupon yet", short: "No coupon", value: "without_coupon", icon: ShoppingBag },
];

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

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ProductsView() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [couponFilter, setCouponFilter] = useState<ProductCouponFilter>("all");
  const [stockFilter, setStockFilter] = useState<ProductStockFilter>("all");
  const [newFilter, setNewFilter] = useState<ProductNewFilter>("all");
  const [sort, setSort] = useState<ProductSort>("coupon_first");
  const [selectedProduct, setSelectedProduct] = useState<ProductListItemDTO | null>(null);

  const filters: ProductListFilters = {
    search: debounced,
    couponFilter,
    stockFilter,
    newFilter,
    sort,
  };
  const summaryQuery = useProductCouponSummary();

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
  } = useProductList(filters);

  const products = flattenProductPages(data?.pages);
  const summary = summaryQuery.data?.data;

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

  const hasActiveFilters =
    debounced.length > 0 ||
    couponFilter !== "all" ||
    stockFilter !== "all" ||
    newFilter !== "all" ||
    sort !== "coupon_first";

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Products</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Products with claimed Shopify coupons appear first — then filter, sort, and drill into redemptions.
          </p>
        </div>
        {isFetching && !isFetchingNextPage && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={Package}
            label="Total products"
            value={String(summary.totalProducts)}
            tone="neutral"
          />
          <SummaryCard
            icon={Ticket}
            label="With coupon sales"
            value={String(summary.productsWithCoupons)}
            tone="violet"
            hint={
              summary.totalProducts > 0
                ? `${Math.round((summary.productsWithCoupons / summary.totalProducts) * 100)}% of catalog`
                : undefined
            }
          />
          <SummaryCard
            icon={ShoppingBag}
            label="Coupon orders"
            value={String(summary.totalCouponOrders)}
            tone="emerald"
          />
          <SummaryCard
            icon={Users}
            label="Customers redeemed"
            value={String(summary.totalCustomers)}
            tone="amber"
          />
        </div>
      )}

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-medium placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-[11px] font-bold text-neutral-500 shrink-0">
          <ArrowUpDown className="size-3.5 text-neutral-400" />
          <span className="hidden sm:inline">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSort)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[11px] font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
          >
            {PRODUCT_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* New + stock filters */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setNewFilter(newFilter === "new" ? "all" : "new")}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition border ${
            newFilter === "new"
              ? "bg-sky-600 text-white border-sky-600"
              : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
          }`}
        >
          <Sparkles className="size-3.5" />
          New <span className="hidden sm:inline">(30 days)</span>
        </button>
        {STOCK_FILTERS.map((f) => {
          const Icon = f.icon;
          const active = stockFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setStockFilter(f.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition border ${
                active
                  ? f.value === "in_stock"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{f.label}</span>
              <span className="sm:hidden">{f.short}</span>
            </button>
          );
        })}
      </div>

      {/* Coupon filters */}
      <div className="flex flex-wrap gap-2">
        {COUPON_FILTERS.map((f) => {
          const Icon = f.icon;
          const active = couponFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setCouponFilter(f.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition border ${
                active
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{f.label}</span>
              <span className="sm:hidden">{f.short}</span>
            </button>
          );
        })}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Filters
          </span>
          {debounced && (
            <FilterChip label={`“${debounced}”`} onRemove={() => setSearch("")} />
          )}
          {couponFilter !== "all" && (
            <FilterChip
              label={COUPON_FILTERS.find((f) => f.value === couponFilter)?.label ?? couponFilter}
              onRemove={() => setCouponFilter("all")}
            />
          )}
          {stockFilter !== "all" && (
            <FilterChip
              label={stockFilterLabel(stockFilter)}
              onRemove={() => setStockFilter("all")}
            />
          )}
          {newFilter !== "all" && (
            <FilterChip label="New products" onRemove={() => setNewFilter("all")} />
          )}
          {sort !== "coupon_first" && (
            <FilterChip
              label={PRODUCT_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}
              onRemove={() => setSort("coupon_first")}
            />
          )}
        </div>
      )}

      {isLoading ? (
        <GridSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load products."}
          onRetry={refetch}
        />
      ) : products.length === 0 ? (
        <EmptyState
          filtered={hasActiveFilters}
          couponFilter={couponFilter}
          stockFilter={stockFilter}
          newFilter={newFilter}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={() => setSelectedProduct(p)}
              />
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

      <ProductCouponDrawer
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone: "neutral" | "violet" | "emerald" | "amber";
  hint?: string;
}) {
  const tones = {
    neutral: "bg-white border-neutral-200/80",
    violet: "bg-violet-50/50 border-violet-100",
    emerald: "bg-emerald-50/50 border-emerald-100",
    amber: "bg-amber-50/50 border-amber-100",
  };
  const iconTones = {
    neutral: "text-neutral-400",
    violet: "text-violet-500",
    emerald: "text-emerald-500",
    amber: "text-amber-500",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`size-4 ${iconTones[tone]}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <p className="text-xl font-black text-neutral-900">{value}</p>
      {hint && <p className="text-[10px] text-neutral-400 mt-0.5 font-semibold">{hint}</p>}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 rounded-full hover:bg-neutral-200 text-neutral-500"
        aria-label={`Remove filter ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function ProductCard({
  product: p,
  onOpen,
}: {
  product: ProductListItemDTO;
  onOpen: () => void;
}) {
  const stats = p.couponStats;
  const hasCoupon = stats && stats.redemptionCount > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`text-left bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
        hasCoupon ? "border-violet-200/80" : "border-neutral-200/80"
      }`}
    >
      <div className="relative">
        <ProductImage src={p.imageUrl} title={p.title} variant="card" />
        <div className="absolute bottom-2 left-2 z-10">
          <ProductStockBadge stock={p.stock} compact />
        </div>
        {p.status && p.status !== "active" && (
          <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-neutral-900/70 text-white text-[9px] font-bold uppercase">
            {p.status}
          </span>
        )}
        {p.isNew && !hasCoupon && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500 text-white text-[9px] font-bold uppercase shadow-sm">
            <Sparkles className="size-2.5" />
            New
          </span>
        )}
        {hasCoupon && (
          <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-600 text-white text-[9px] font-bold uppercase shadow-sm">
            <Ticket className="size-2.5" />
            Coupon used
          </span>
        )}
      </div>

      <div className="p-3.5 flex-1 flex flex-col gap-2">
        <div>
          <p className="text-sm font-bold text-neutral-900 line-clamp-2 leading-snug">
            {p.title ?? "Untitled product"}
          </p>
          {p.vendor && (
            <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{p.vendor}</p>
          )}
          {p.isNew && (
            <p className="text-[10px] font-semibold text-sky-600 mt-0.5">
              Added {shortDate(p.createdAt)}
            </p>
          )}
        </div>

        {hasCoupon ? (
          <div className="rounded-xl bg-violet-50/80 border border-violet-100 p-2.5 space-y-1.5 mt-auto">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-violet-700 flex items-center gap-1">
                <Users className="size-3" />
                {stats.customerCount} customer{stats.customerCount === 1 ? "" : "s"}
              </span>
              <span className="text-[10px] font-bold text-violet-600">
                {stats.redemptionCount} order{stats.redemptionCount === 1 ? "" : "s"}
              </span>
            </div>
            {stats.latestDiscountCode && (
              <p className="text-[10px] font-mono font-bold text-violet-800 truncate">
                {stats.latestDiscountCode}
              </p>
            )}
            {stats.latestCustomerName && (
              <p className="text-[10px] text-violet-600/80 truncate">
                Latest: {stats.latestCustomerName}
                {stats.lastRedeemedAt ? ` · ${shortDate(stats.lastRedeemedAt)}` : ""}
              </p>
            )}
            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 pt-0.5">
              <TrendingUp className="size-3" />
              {money(stats.revenue)} via coupons
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-1 space-y-1">
            <p className="text-xs font-black text-neutral-900">{money(p.price)}</p>
            <p className="text-[10px] text-neutral-500">
              {p.stock.available !== null
                ? `${p.stock.available} unit${p.stock.available === 1 ? "" : "s"} available`
                : "No coupon redemptions yet"}
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-neutral-200/80 overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100 bg-[length:200%_100%] animate-shimmer" />
          <div className="p-3.5 space-y-2">
            <div className="h-3 w-3/4 bg-neutral-100 rounded" />
            <div className="h-2.5 w-1/3 bg-neutral-50 rounded" />
            <div className="h-14 w-full bg-neutral-50 rounded-xl mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filtered,
  couponFilter,
  stockFilter,
  newFilter,
}: {
  filtered: boolean;
  couponFilter: ProductCouponFilter;
  stockFilter: ProductStockFilter;
  newFilter: ProductNewFilter;
}) {
  const message =
    newFilter === "new"
      ? {
          title: "No new products",
          body: "Products synced in the last 30 days will appear here.",
        }
      : stockFilter === "in_stock"
      ? {
          title: "No in-stock products",
          body: "Products with available inventory will appear here once synced from Shopify.",
        }
      : stockFilter === "low_stock"
        ? {
            title: "No low-stock products",
            body: "Products with 5 or fewer units will show here.",
          }
        : stockFilter === "out_of_stock"
          ? {
              title: "No out-of-stock products",
              body: "Great — nothing is currently marked as out of stock.",
            }
          : couponFilter === "with_coupon"
      ? {
          title: "No products with coupon redemptions",
          body: "When customers apply your EngageOS Shopify coupon codes on orders, matching products will appear here.",
        }
      : couponFilter === "without_coupon"
        ? {
            title: "All products have coupon redemptions",
            body: "Every product in your catalog has been purchased with an EngageOS coupon at least once.",
          }
        : filtered
          ? {
              title: "No products match your search",
              body: "Try a different search term or clear your filters.",
            }
          : {
              title: "No products yet",
              body: "Products appear here once your store syncs its catalog.",
            };

  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Package className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">{message.title}</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">{message.body}</p>
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
