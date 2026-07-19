"use client";

/**
 * WinnersView — interactive client island for `/m/winners`.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gift,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Ticket,
  Trophy,
  X,
} from "lucide-react";
import {
  useWinnersList,
  useWinnersSummary,
  wonDateToApi,
  type WonDateValue,
} from "@/lib/api/hooks/use-winners";
import type { WinnerListItemDTO, WinnerPrizeCategory } from "@/lib/api/types";
import { CustomerDetailDrawer } from "@/components/merchant/customers/customer-detail-drawer";
import {
  WinnersDateFilter,
  wonDateLabel,
} from "@/components/merchant/winners/winners-date-filter";
import { timeAgo } from "@/components/merchant/campaign-events-timeline";
import { flattenCampaignPages, useCampaignList } from "@/lib/api/hooks/use-dashboard";
import { maskPhone, whatsappDigits } from "@/lib/merchant/mask-phone";
import { prizeTypeLabel } from "@/lib/merchant/prize-labels";
import { CodeChip } from "@/components/merchant/winners/code-chip";
import { WinnerExportButton } from "@/components/merchant/winners/winner-export-button";
import {
  campaignFilterLabel,
  campaignFilterToApi,
  DEFAULT_CAMPAIGN_FILTER,
  WinnersCampaignFilter,
} from "@/components/merchant/winners/winners-campaign-filter";

const TABS: { label: string; value: WinnerPrizeCategory }[] = [
  { label: "All Winners", value: "all" },
  { label: "Coupons", value: "coupon" },
  { label: "Gifts", value: "gift" },
  { label: "Scratch & Win", value: "scratch_win" },
];

const PAGE_SIZES = [12, 25, 50];

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function initials(name: string | null): string {
  if (!name) return "??";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const nf = new Intl.NumberFormat("en-IN");

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function WinnersView() {
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounced(rawSearch);
  const [prizeCategory, setPrizeCategory] = useState<WinnerPrizeCategory>("all");
  const [wonDate, setWonDate] = useState<WonDateValue>({ preset: "30d", from: "", to: "" });
  const [campaignFilter, setCampaignFilter] = useState(DEFAULT_CAMPAIGN_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const dateApi = wonDateToApi(wonDate);
  const campaignApi = useMemo(() => campaignFilterToApi(campaignFilter), [campaignFilter]);
  const filters = useMemo(
    () => ({
      search,
      prizeCategory,
      campaignId: campaignApi.campaignId,
      campaignScope: campaignApi.campaignScope,
      wonFrom: dateApi.wonFrom,
      wonTo: dateApi.wonTo,
    }),
    [search, prizeCategory, campaignApi, dateApi.wonFrom, dateApi.wonTo]
  );

  useEffect(() => {
    setPage(1);
  }, [search, prizeCategory, campaignFilter, wonDate.preset, wonDate.from, wonDate.to]);

  const list = useWinnersList(filters, page, pageSize);
  const summary = useWinnersSummary(dateApi.wonFrom, dateApi.wonTo);
  const activeCampaignsQuery = useCampaignList("active");
  const endedCampaignsQuery = useCampaignList("completed");
  const activeCampaigns = flattenCampaignPages(activeCampaignsQuery.data?.pages);
  const endedCampaigns = flattenCampaignPages(endedCampaignsQuery.data?.pages);
  const campaignsLoading = activeCampaignsQuery.isLoading || endedCampaignsQuery.isLoading;

  const winners = list.data?.data ?? [];
  const totalCount = list.data?.page?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n++;
    if (campaignFilter !== DEFAULT_CAMPAIGN_FILTER) n++;
    if (wonDate.preset !== "30d") n++;
    return n;
  }, [search, campaignFilter, wonDate.preset]);

  const filtered =
    !!search.trim() ||
    campaignFilter !== DEFAULT_CAMPAIGN_FILTER ||
    prizeCategory !== "all" ||
    wonDate.preset !== "30d";

  const clearFilters = () => {
    setRawSearch("");
    setPrizeCategory("all");
    setCampaignFilter(DEFAULT_CAMPAIGN_FILTER);
    setWonDate({ preset: "30d", from: "", to: "" });
    setPage(1);
  };

  const campaignFilterText = campaignFilterLabel(campaignFilter, activeCampaigns, endedCampaigns);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-amber-50 shrink-0">
            <Trophy className="size-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Live Winners</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Every prize awarded across your campaigns, newest first.
            </p>
          </div>
        </div>
        <WinnerExportButton filters={filters} />
      </div>

      {/* Today / Yesterday quick cards */}
      <TodayYesterdayCards
        data={summary.data}
        loading={summary.isLoading}
        activePreset={wonDate.preset}
        onSelect={(preset) => setWonDate({ preset, from: "", to: "" })}
      />

      {/* KPI cards */}
      <KpiRow
        data={summary.data}
        loading={summary.isLoading}
        periodLabel={
          wonDate.preset === "30d"
            ? "this month"
            : wonDate.preset === "today"
              ? "today"
              : wonDate.preset === "yesterday"
                ? "yesterday"
                : wonDateLabel(wonDate).toLowerCase()
        }
      />

      {/* Toolbar + table card */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 px-4 pt-4 border-b border-neutral-100">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setPrizeCategory(tab.value)}
              className={`px-3.5 py-2 rounded-full text-xs font-bold transition ${
                prizeCategory === tab.value
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + date + filters */}
        <div className="p-4 border-b border-neutral-100 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
              <input
                type="search"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Search by customer name, phone or code…"
                className="w-full pl-10 pr-10 py-3 text-sm bg-neutral-50 border border-neutral-200/80 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition"
                aria-label="Search winners"
              />
              {rawSearch ? (
                <button
                  type="button"
                  onClick={() => setRawSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-neutral-400 hover:text-neutral-600"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : list.isFetching && !list.isLoading ? (
                <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-emerald-500 animate-spin" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <WinnersCampaignFilter
                value={campaignFilter}
                onChange={setCampaignFilter}
                activeCampaigns={activeCampaigns}
                endedCampaigns={endedCampaigns}
                loading={campaignsLoading}
              />
              <WinnersDateFilter value={wonDate} onChange={setWonDate} />
            </div>
          </div>

        </div>

        {/* Active chips */}
        {(filtered || winners.length > 0) && (
          <div className="px-4 py-3 bg-neutral-50/80 border-b border-neutral-100 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
              <SlidersHorizontal className="size-3" />
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}` : "Showing all"}
            </span>
            {search.trim() && (
              <FilterChip label={`“${search.trim()}”`} onRemove={() => setRawSearch("")} />
            )}
            {campaignFilter !== DEFAULT_CAMPAIGN_FILTER && (
              <FilterChip label={campaignFilterText} onRemove={() => setCampaignFilter(DEFAULT_CAMPAIGN_FILTER)} />
            )}
            {wonDate.preset !== "30d" && (
              <FilterChip label={wonDateLabel(wonDate)} onRemove={() => setWonDate({ preset: "30d", from: "", to: "" })} />
            )}
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-bold text-neutral-500 hover:text-neutral-800 ml-auto underline-offset-2 hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Table body */}
        {list.isLoading ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState
            message={list.error instanceof Error ? list.error.message : "Failed to load winners."}
            onRetry={() => list.refetch()}
          />
        ) : winners.length === 0 ? (
          <EmptyState filtered={filtered} onClear={clearFilters} />
        ) : (
          <>
            {list.isFetching && !list.isLoading && (
              <div className="px-5 py-2 border-b border-neutral-100 bg-emerald-50/50 flex items-center gap-2">
                <Loader2 className="size-3 animate-spin text-emerald-600" />
                <span className="text-[10px] font-semibold text-emerald-700">Updating results…</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead>
                  <tr className="border-b border-neutral-100 text-[11px] font-bold uppercase tracking-wide text-neutral-400 bg-neutral-50/50">
                    <th className="py-3 px-5">Customer</th>
                    <th className="py-3 px-3">Prize</th>
                    <th className="py-3 px-3 hidden md:table-cell">Campaign</th>
                    <th className="py-3 px-3">Code</th>
                    <th className="py-3 px-3">Won</th>
                    <th className="py-3 px-3 text-center">Channel</th>
                    <th className="py-3 px-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((w) => (
                    <WinnerRow
                      key={w.eventId}
                      winner={w}
                      onOpen={() => w.customerId && setSelectedCustomerId(w.customerId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationBar
              from={from}
              to={to}
              total={totalCount}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      {selectedCustomerId && (
        <CustomerDetailDrawer
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </div>
  );
}

function WinnerRow({
  winner: w,
  onOpen,
}: {
  winner: WinnerListItemDTO;
  onOpen: () => void;
}) {
  const wa = whatsappDigits(w.customerPhone);
  const canWhatsApp = !!wa && !w.waOptOut;

  return (
    <tr
      onClick={onOpen}
      className="border-b border-neutral-50 last:border-0 hover:bg-emerald-50/30 cursor-pointer transition-colors"
    >
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center size-9 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black shrink-0 border border-amber-100">
            {initials(w.customerName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-neutral-900 truncate">{w.customerName ?? "Guest"}</p>
            <p className="text-[11px] text-neutral-400 font-semibold">{maskPhone(w.customerPhone)}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-neutral-800 truncate">{w.prizeName ?? "Prize"}</span>
          {w.prizeType && (
            <span className="shrink-0 text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-md px-2 py-0.5 border border-neutral-200/60">
              {prizeTypeLabel(w.prizeType)}
            </span>
          )}
        </div>
      </td>
      <td className="py-3.5 px-3 hidden md:table-cell min-w-0">
        <span className="text-xs text-neutral-500 font-medium truncate block max-w-[160px]">
          {w.campaignName ?? "—"}
        </span>
      </td>
      <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
        <CodeChip code={w.couponCode} />
      </td>
      <td className="py-3.5 px-3">
        <p className="text-[11px] font-semibold text-neutral-600">{timeAgo(w.wonAt)}</p>
        <p className="text-[10px] text-neutral-400 font-medium mt-0.5">{formatDateTime(w.wonAt)}</p>
      </td>
      <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
        {canWhatsApp ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center size-8 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition shadow-sm"
            title="Open WhatsApp"
            aria-label="Open WhatsApp chat"
          >
            <WhatsAppIcon className="size-4" />
          </a>
        ) : (
          <span className="inline-block size-8" />
        )}
      </td>
      <td className="py-3.5 px-5 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onOpen}
          disabled={!w.customerId}
          className="inline-flex items-center justify-center size-8 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50 transition disabled:opacity-30"
          title="View customer"
          aria-label="View customer"
        >
          <Eye className="size-4" />
        </button>
      </td>
    </tr>
  );
}

function TodayYesterdayCards({
  data,
  loading,
  activePreset,
  onSelect,
}: {
  data?: { winnersToday: number; winnersYesterday: number };
  loading: boolean;
  activePreset: WonDateValue["preset"];
  onSelect: (preset: "today" | "yesterday") => void;
}) {
  const cards = [
    {
      preset: "today" as const,
      label: "Today's Winners",
      value: data?.winnersToday ?? 0,
      sub: "Prizes won today (IST)",
      tone: "from-emerald-50 to-teal-50 border-emerald-200/80",
      iconTone: "bg-emerald-500 text-white",
      activeRing: "ring-2 ring-emerald-500 ring-offset-2",
    },
    {
      preset: "yesterday" as const,
      label: "Yesterday's Winners",
      value: data?.winnersYesterday ?? 0,
      sub: "Prizes won yesterday (IST)",
      tone: "from-violet-50 to-indigo-50 border-violet-200/80",
      iconTone: "bg-violet-500 text-white",
      activeRing: "ring-2 ring-violet-500 ring-offset-2",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((c) => {
        const active = activePreset === c.preset;
        return (
          <button
            key={c.preset}
            type="button"
            onClick={() => onSelect(c.preset)}
            className={`text-left rounded-3xl border bg-gradient-to-br p-5 shadow-sm transition hover:shadow-md ${c.tone} ${
              active ? c.activeRing : "hover:scale-[1.01]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{c.label}</p>
                {loading && !data ? (
                  <div className="h-9 w-20 bg-white/60 rounded-lg mt-2 animate-pulse" />
                ) : (
                  <p className="text-3xl font-black text-neutral-900 mt-1 tracking-tight">{nf.format(c.value)}</p>
                )}
                <p className="text-[10px] font-semibold text-neutral-500 mt-1">{c.sub}</p>
              </div>
              <div className={`flex items-center justify-center size-11 rounded-2xl shrink-0 ${c.iconTone}`}>
                <Calendar className="size-5" />
              </div>
            </div>
            {active && (
              <p className="text-[10px] font-bold text-emerald-700 mt-3">Showing {c.preset === "today" ? "today" : "yesterday"} in the list below</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function KpiRow({
  data,
  loading,
  periodLabel,
}: {
  data?: {
    totalWinners: number;
    couponsWon: number;
    giftsWon: number;
    ongoingCampaigns: number;
    prizesInPeriod: number;
    momGrowthPct: number;
    couponsPct: number;
    giftsPct: number;
    winnersToday: number;
    winnersYesterday: number;
  };
  loading: boolean;
  periodLabel: string;
}) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl bg-neutral-100 animate-pulse" />
        ))}
      </div>
    );
  }

  const d = data ?? {
    totalWinners: 0,
    couponsWon: 0,
    giftsWon: 0,
    ongoingCampaigns: 0,
    prizesInPeriod: 0,
    momGrowthPct: 0,
    couponsPct: 0,
    giftsPct: 0,
    winnersToday: 0,
    winnersYesterday: 0,
  };

  const trend =
    d.momGrowthPct > 0
      ? `+${d.momGrowthPct}% this month`
      : d.momGrowthPct < 0
        ? `${d.momGrowthPct}% this month`
        : "No change this month";

  const cards = [
    {
      icon: Trophy,
      tone: "bg-amber-50 text-amber-600",
      label: "Total Winners",
      value: nf.format(d.totalWinners),
      sub: trend,
      subTone: d.momGrowthPct >= 0 ? "text-emerald-600" : "text-red-500",
    },
    {
      icon: Ticket,
      tone: "bg-violet-50 text-violet-600",
      label: "Coupons Won",
      value: nf.format(d.couponsWon),
      sub: `${d.couponsPct}% of total`,
      subTone: "text-neutral-500",
    },
    {
      icon: Gift,
      tone: "bg-emerald-50 text-emerald-600",
      label: "Gifts Won",
      value: nf.format(d.giftsWon),
      sub: `${d.giftsPct}% of total`,
      subTone: "text-neutral-500",
    },
    {
      icon: Megaphone,
      tone: "bg-blue-50 text-blue-600",
      label: "Ongoing Campaigns",
      value: nf.format(d.ongoingCampaigns),
      sub: "Active now",
      subTone: "text-neutral-500",
    },
    {
      icon: Trophy,
      tone: "bg-purple-50 text-purple-600",
      label: "Total Prizes Given",
      value: nf.format(d.prizesInPeriod),
      sub: periodLabel,
      subTone: "text-neutral-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4">
          <div className={`flex items-center justify-center size-9 rounded-xl ${c.tone}`}>
            <c.icon className="size-4.5" />
          </div>
          <p className="text-2xl font-black text-neutral-900 mt-3 tracking-tight">{c.value}</p>
          <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">{c.label}</p>
          <p className={`text-[10px] font-bold mt-1 ${c.subTone}`}>{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function PaginationBar({
  from,
  to,
  total,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  const pages = useMemo(() => {
    const items: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) items.push(i);
      return items;
    }
    items.push(1);
    if (page > 3) items.push("ellipsis");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      items.push(i);
    }
    if (page < totalPages - 2) items.push("ellipsis");
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  return (
    <div className="px-5 py-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-[11px] font-semibold text-neutral-500">
        Showing {from} to {to} of {nf.format(total)} results
      </p>
      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="text-[11px] font-bold bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5"
          aria-label="Results per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span key={`e-${i}`} className="px-1 text-neutral-400 text-xs">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={`min-w-8 h-8 rounded-lg text-xs font-bold transition ${
                  p === page
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-white border border-emerald-200/80 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 transition group"
    >
      {label}
      <span className="flex size-4 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200">
        <X className="size-2.5" />
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
          <div className="size-9 rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-neutral-100 rounded w-1/3" />
            <div className="h-2 bg-neutral-100 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="size-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-6 text-red-500" />
      </div>
      <p className="text-sm font-bold text-neutral-900">Couldn&apos;t load winners</p>
      <p className="text-xs text-neutral-500 mt-1 max-w-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800"
      >
        <RefreshCw className="size-3.5" />
        Try again
      </button>
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm font-bold text-neutral-900">No matching winners</p>
        <p className="text-xs text-neutral-500 mt-1">Try adjusting your search or filters.</p>
        <button
          type="button"
          onClick={onClear}
          className="mt-4 text-xs font-bold text-emerald-600 hover:text-emerald-700 underline-offset-2 hover:underline"
        >
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="size-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <Trophy className="size-7 text-amber-400" />
      </div>
      <p className="text-sm font-bold text-neutral-900">No winners yet</p>
      <p className="text-xs text-neutral-500 mt-1 max-w-xs">
        As customers win prizes, they&apos;ll appear here. Launch a campaign to get started.
      </p>
      <Link
        href="/m/campaigns/new"
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16A34A] text-white text-xs font-bold hover:bg-[#15803D] shadow-sm shadow-emerald-500/20"
      >
        Create campaign
      </Link>
    </div>
  );
}
