"use client";

/**
 * CustomersView — the interactive client island for `/m/customers`.
 *
 * Debounced AJAX search, reward/joined filters, infinite scroll, CSV export,
 * and the customer 360 drawer.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search,
  Users,
  AlertTriangle,
  Loader2,
  RefreshCw,
  X,
  Ticket,
  Gift,
  CheckCircle2,
  CircleOff,
  SlidersHorizontal,
} from "lucide-react";
import {
  useCustomerList,
  flattenCustomerPages,
  type CustomerListFilters,
  type CustomerRewardFilter,
} from "@/lib/api/hooks/use-customers";
import type { CustomerListItemDTO } from "@/lib/api/types";
import { CustomerDetailDrawer } from "@/components/merchant/customers/customer-detail-drawer";
import {
  CustomerDateFilter,
  joinedLabel,
  joinedValueToApi,
  type JoinedDateValue,
} from "@/components/merchant/customers/customer-date-filter";
import { CustomerExportButton } from "@/components/merchant/customers/customer-export-button";

const REWARD_FILTERS: {
  label: string;
  short: string;
  value: CustomerRewardFilter;
  icon: typeof Ticket;
}[] = [
  { label: "All rewards", short: "All", value: "all", icon: Users },
  { label: "Has coupon", short: "Has code", value: "has_code", icon: Ticket },
  { label: "Active code", short: "Active", value: "active", icon: Gift },
  { label: "Redeemed", short: "Redeemed", value: "redeemed", icon: CheckCircle2 },
  { label: "No reward", short: "None", value: "no_reward", icon: CircleOff },
];

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

function hasActiveFilters(filters: CustomerListFilters): boolean {
  return (
    !!filters.search?.trim() ||
    (filters.rewardFilter != null && filters.rewardFilter !== "all") ||
    (filters.joined != null && filters.joined !== "all") ||
    !!filters.joinedFrom ||
    !!filters.joinedTo
  );
}

export function CustomersView() {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const [rewardFilter, setRewardFilter] = useState<CustomerRewardFilter>("all");
  const [joinedDate, setJoinedDate] = useState<JoinedDateValue>({
    preset: "all",
    from: "",
    to: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const joinedApi = joinedValueToApi(joinedDate);
  const filters: CustomerListFilters = {
    search,
    rewardFilter,
    joined: joinedApi.joined,
    joinedFrom: joinedApi.joinedFrom ?? null,
    joinedTo: joinedApi.joinedTo ?? null,
  };
  const filtered = hasActiveFilters(filters);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    if (rewardFilter !== "all") n++;
    if (joinedDate.preset !== "all") n++;
    return n;
  }, [search, rewardFilter, joinedDate.preset]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (search.trim()) {
      chips.push({ key: "search", label: `“${search.trim()}”`, onRemove: () => setRawSearch("") });
    }
    if (rewardFilter !== "all") {
      const f = REWARD_FILTERS.find((r) => r.value === rewardFilter);
      chips.push({
        key: "reward",
        label: f?.label ?? rewardFilter,
        onRemove: () => setRewardFilter("all"),
      });
    }
    if (joinedDate.preset !== "all") {
      chips.push({
        key: "joined",
        label: joinedLabel(joinedDate),
        onRemove: () => setJoinedDate({ preset: "all", from: "", to: "" }),
      });
    }
    return chips;
  }, [search, rewardFilter, joinedDate]);

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
  } = useCustomerList(filters);

  const customers = flattenCustomerPages(data?.pages);

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

  function clearFilters() {
    setRawSearch("");
    setRewardFilter("all");
    setJoinedDate({ preset: "all", from: "", to: "" });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Customers</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Campaign customers — search, filter by rewards and join date, then export.
          </p>
        </div>
        <CustomerExportButton
          baseFilters={{ search, rewardFilter }}
          currentJoined={joinedDate}
          disabled={isLoading}
          customerCount={customers.length}
          hasMore={hasNextPage}
        />
      </header>

      {/* Unified search + filters toolbar */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <div className="p-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search name, phone, email, or coupon code…"
              className="w-full pl-10 pr-10 py-3 text-sm bg-neutral-50 border border-neutral-200/80 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition"
              aria-label="Search customers"
            />
            {rawSearch ? (
              <button
                type="button"
                onClick={() => setRawSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            ) : isFetching && !isFetchingNextPage ? (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-emerald-500 animate-spin" />
            ) : null}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SegmentedFilterGroup
              label="Coupon / gift"
              icon={Ticket}
              options={REWARD_FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                short: f.short,
                icon: f.icon,
              }))}
              value={rewardFilter}
              onChange={(v) => setRewardFilter(v as CustomerRewardFilter)}
            />
            <CustomerDateFilter value={joinedDate} onChange={setJoinedDate} />
          </div>
        </div>

        {(filtered || customers.length > 0) && (
          <div className="px-4 py-3 bg-neutral-50/80 border-t border-neutral-100 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
              <SlidersHorizontal className="size-3" />
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}` : "Showing all"}
            </span>
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-emerald-200/80 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 transition group"
              >
                {chip.label}
                <span className="flex size-4 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200">
                  <X className="size-2.5" />
                </span>
              </button>
            ))}
            {!isLoading && (
              <span className="text-[11px] font-semibold text-neutral-500 ml-auto">
                {customers.length}
                {hasNextPage ? "+" : ""} customer{customers.length === 1 ? "" : "s"}
              </span>
            )}
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-bold text-neutral-500 hover:text-neutral-800 underline-offset-2 hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <ErrorState message={error instanceof Error ? error.message : "Failed to load customers."} onRetry={refetch} />
        ) : customers.length === 0 ? (
          <EmptyState filtered={filtered} onClear={clearFilters} />
        ) : (
          <>
            {isFetching && !isFetchingNextPage && (
              <div className="px-5 py-2 border-b border-neutral-100 bg-emerald-50/50 flex items-center gap-2">
                <Loader2 className="size-3 animate-spin text-emerald-600" />
                <span className="text-[10px] font-semibold text-emerald-700">Updating results…</span>
              </div>
            )}
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100 text-[9px] uppercase tracking-wider text-neutral-400 font-black bg-neutral-50/50">
                  <th className="py-3 px-5">Customer</th>
                  <th className="py-3 px-3 hidden sm:table-cell">Phone</th>
                  <th className="py-3 px-3">Coupon / Gift</th>
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
                    <td className="py-3 px-3">
                      {c.latestCode || c.latestPrizeName ? (
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-neutral-900 truncate">
                            {c.latestCode || c.latestPrizeName}
                          </p>
                          {c.latestCode && c.latestPrizeName && (
                            <p className="text-[10px] text-neutral-400 truncate">{c.latestPrizeName}</p>
                          )}
                          {c.rewardCount > 1 && (
                            <p className="text-[10px] font-semibold text-emerald-600">
                              +{c.rewardCount - 1} more
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-300">—</span>
                      )}
                    </td>
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

      {selectedId && (
        <CustomerDetailDrawer customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function SegmentedFilterGroup({
  label,
  icon: GroupIcon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: typeof Ticket;
  options: {
    value: string;
    label: string;
    short: string;
    icon?: typeof Ticket;
  }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <GroupIcon className="size-3.5" />
        </div>
        <span className="text-[11px] font-bold text-neutral-700">{label}</span>
      </div>
      <div
        className={`flex gap-1 p-1 bg-neutral-100/80 rounded-xl ${
          options.length > 4 ? "overflow-x-auto scrollbar-none" : "grid"
        }`}
        style={
          options.length <= 4
            ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
            : undefined
        }
        role="group"
        aria-label={label}
      >
        {options.map((opt) => {
          const active = value === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.label}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 px-2.5 py-2 rounded-lg text-center transition-all shrink-0 ${
                options.length > 4 ? "min-w-[4.5rem] flex-1" : ""
              } ${
                active
                  ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200/80"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              {Icon && <Icon className={`size-3.5 shrink-0 ${active ? "text-emerald-600" : ""}`} />}
              <span className="text-[10px] font-bold leading-tight truncate w-full">
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-neutral-50 flex items-center justify-center mb-4">
        <Users className="size-7 text-neutral-300" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">
        {filtered ? "No matching customers" : "No customers yet"}
      </h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        {filtered
          ? "Try a different search term or filter."
          : "Customers appear here as they join your campaigns."}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 text-[11px] font-bold text-emerald-600 hover:text-emerald-700"
        >
          Clear all filters
        </button>
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
