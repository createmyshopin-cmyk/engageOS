"use client";

/**
 * LoyaltyView — the interactive client island for `/m/loyalty`.
 *
 * Phase 1–3: dashboard, wallet, rules/tiers config, and customer drill-down.
 */

import { useState, useEffect } from "react";
import {
  Search,
  Award,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ShoppingBag,
  Gamepad2,
  Trophy,
  Ticket,
  IndianRupee,
  HeartPulse,
  CalendarClock,
  LayoutDashboard,
  User,
  Wallet,
  Settings2,
  Crown,
} from "lucide-react";
import { useCustomerList, flattenCustomerPages } from "@/lib/api/hooks/use-customers";
import { useLoyaltyProfile } from "@/lib/api/hooks/use-loyalty";
import { useLoyaltyWallet } from "@/lib/api/hooks/use-loyalty-wallet";
import type { CustomerListItemDTO, LoyaltyLeaderboardItemDTO, LoyaltyProfileDTO } from "@/lib/api/types";
import { LoyaltyDashboard } from "@/components/merchant/loyalty/loyalty-dashboard";
import { LoyaltyLeaderboard } from "@/components/merchant/loyalty/loyalty-leaderboard";
import { LoyaltyTierBadge } from "@/components/merchant/loyalty/loyalty-tier-badge";
import { CustomerDetailDrawer } from "@/components/merchant/customers/customer-detail-drawer";
import { LoyaltyWalletPanel } from "@/components/merchant/loyalty/loyalty-wallet-panel";
import { LoyaltyRulesPanel } from "@/components/merchant/loyalty/loyalty-rules-panel";
import { LoyaltyTiersPanel } from "@/components/merchant/loyalty/loyalty-tiers-panel";

import { tierFromLifetimePoints, type LoyaltyTier } from "@/lib/loyalty/tiers";

type Tab = "dashboard" | "wallet" | "customer" | "rules" | "tiers";

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LoyaltyView() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [selectedLeaderboard, setSelectedLeaderboard] = useState<LoyaltyLeaderboardItemDTO | null>(
    null
  );

  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState<CustomerListItemDTO | null>(null);

  const list = useCustomerList({ search: debounced });
  const results = flattenCustomerPages(list.data?.pages).slice(0, 8);
  const loyalty = useLoyaltyProfile(selected?.id ?? null);
  const wallet = useLoyaltyWallet(selected?.id ?? null);

  function handleLeaderboardSelect(row: LoyaltyLeaderboardItemDTO) {
    setSelectedLeaderboard(row);
    setDrawerId(row.customerId);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Loyalty Engine</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Points, tiers, and spend — your full loyalty engine.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-neutral-100 rounded-xl p-1">
          <TabButton
            active={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
            icon={LayoutDashboard}
            label="Dashboard"
          />
          <TabButton
            active={tab === "wallet"}
            onClick={() => setTab("wallet")}
            icon={Wallet}
            label="Wallet"
          />
          <TabButton
            active={tab === "rules"}
            onClick={() => setTab("rules")}
            icon={Settings2}
            label="Rules"
          />
          <TabButton
            active={tab === "tiers"}
            onClick={() => setTab("tiers")}
            icon={Crown}
            label="Tiers"
          />
          <TabButton
            active={tab === "customer"}
            onClick={() => setTab("customer")}
            icon={User}
            label="Customer"
          />
        </div>
      </header>

      {tab === "dashboard" ? (
        <div className="space-y-6">
          <LoyaltyDashboard />
          <LoyaltyLeaderboard
            onSelect={handleLeaderboardSelect}
            selectedId={selectedLeaderboard?.customerId}
          />
        </div>
      ) : tab === "wallet" ? (
        <LoyaltyWalletPanel />
      ) : tab === "rules" ? (
        <LoyaltyRulesPanel />
      ) : tab === "tiers" ? (
        <LoyaltyTiersPanel />
      ) : (
        <CustomerLookup
          search={search}
          setSearch={setSearch}
          debounced={debounced}
          selected={selected}
          setSelected={setSelected}
          list={list}
          results={results}
          loyalty={loyalty}
          wallet={wallet}
          onOpenDrawer={setDrawerId}
        />
      )}

      {drawerId && (
        <CustomerDetailDrawer customerId={drawerId} onClose={() => setDrawerId(null)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition ${
        active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-500 hover:text-neutral-700"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function CustomerLookup({
  search,
  setSearch,
  debounced,
  selected,
  setSelected,
  list,
  results,
  loyalty,
  wallet,
  onOpenDrawer,
}: {
  search: string;
  setSearch: (v: string) => void;
  debounced: string;
  selected: CustomerListItemDTO | null;
  setSelected: (c: CustomerListItemDTO | null) => void;
  list: ReturnType<typeof useCustomerList>;
  results: CustomerListItemDTO[];
  loyalty: ReturnType<typeof useLoyaltyProfile>;
  wallet: ReturnType<typeof useLoyaltyWallet>;
  onOpenDrawer: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
          }}
          placeholder="Search a customer by name, phone, or email…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-medium placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
        />
        {debounced.length > 0 && !selected && (
          <div className="absolute z-10 mt-2 w-full bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-hidden">
            {list.isLoading ? (
              <div className="px-4 py-3 text-xs text-neutral-400 flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-xs text-neutral-400">No customers found.</div>
            ) : (
              <ol className="divide-y divide-neutral-50 max-h-72 overflow-auto">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setSelected(c);
                        setSearch(c.name ?? c.phone);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition"
                    >
                      <p className="text-xs font-bold text-neutral-900">{c.name ?? "Unnamed"}</p>
                      <p className="text-[10px] text-neutral-400">{c.phone}</p>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {!selected ? (
        <PickerEmpty />
      ) : loyalty.isLoading ? (
        <StandingSkeleton />
      ) : loyalty.isError ? (
        <ErrorState
          message={
            loyalty.error instanceof Error ? loyalty.error.message : "Failed to load loyalty."
          }
          onRetry={loyalty.refetch}
        />
      ) : loyalty.data ? (
        <Standing
          customer={selected}
          data={loyalty.data}
          tier={wallet.data?.tier ?? tierFromLifetimePoints(wallet.data?.lifetimePoints ?? 0)}
          onOpen360={() => onOpenDrawer(selected.id)}
        />
      ) : null}
    </div>
  );
}

function Standing({
  customer,
  data,
  tier,
  onOpen360,
}: {
  customer: CustomerListItemDTO;
  data: LoyaltyProfileDTO;
  tier: LoyaltyTier;
  onOpen360: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5 flex items-center gap-4">
        <div className="flex items-center justify-center size-12 rounded-2xl bg-amber-50 text-amber-600 shrink-0">
          <Award className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-neutral-900 truncate">{customer.name ?? "Unnamed"}</p>
          <p className="text-[11px] font-semibold text-neutral-500">{customer.phone}</p>
        </div>
        <LoyaltyTierBadge tier={tier} />
        {data.rfmScore && (
          <div className="text-right pl-4 border-l border-neutral-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">RFM</p>
            <p className="text-lg font-black text-neutral-900">{data.rfmScore}</p>
          </div>
        )}
        {data.healthScore != null && (
          <div className="text-right pl-4 border-l border-neutral-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Health</p>
            <p className="text-lg font-black text-emerald-600">{data.healthScore}</p>
          </div>
        )}
        <button
          onClick={onOpen360}
          className="shrink-0 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50"
        >
          View 360
        </button>
      </div>

      {data.computedAt == null && (
        <div className="rounded-2xl bg-neutral-50 border border-neutral-100 px-4 py-3 text-[11px] font-semibold text-neutral-500">
          No engagement recorded yet — this standing will populate as the customer plays,
          redeems, and shops.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Metric icon={ShoppingBag} tone="bg-blue-50 text-blue-600" label="Orders" value={String(data.totalOrders)} />
        <Metric icon={IndianRupee} tone="bg-emerald-50 text-emerald-600" label="Total spend" value={money(data.totalSpend)} />
        <Metric
          icon={IndianRupee}
          tone="bg-emerald-50 text-emerald-600"
          label="Avg order value"
          value={data.avgOrderValue != null ? money(data.avgOrderValue) : "—"}
        />
        <Metric icon={Gamepad2} tone="bg-violet-50 text-violet-600" label="Plays" value={String(data.totalPlays)} />
        <Metric icon={Trophy} tone="bg-amber-50 text-amber-600" label="Wins" value={String(data.totalWins)} />
        <Metric icon={Ticket} tone="bg-pink-50 text-pink-600" label="Redemptions" value={String(data.totalRedemptions)} />
        <Metric
          icon={CalendarClock}
          tone="bg-neutral-100 text-neutral-600"
          label="Recency"
          value={data.recencyDays != null ? `${data.recencyDays}d` : "—"}
        />
        <Metric
          icon={HeartPulse}
          tone="bg-red-50 text-red-500"
          label="Lifetime value"
          value={data.clv != null ? money(data.clv) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
        <Footnote label="First seen" value={shortDate(data.firstSeenAt)} />
        <Footnote label="Last seen" value={shortDate(data.lastSeenAt)} />
        <Footnote label="Last order" value={shortDate(data.lastOrderAt)} />
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof ShoppingBag;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-4">
      <div className={`flex items-center justify-center size-8 rounded-xl ${tone}`}>
        <Icon className="size-4" />
      </div>
      <p className="text-lg font-black text-neutral-900 mt-3 tracking-tight">{value}</p>
      <p className="text-[10px] font-semibold text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

function Footnote({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm px-4 py-3 flex items-center justify-between">
      <span className="font-semibold text-neutral-400">{label}</span>
      <span className="font-bold text-neutral-700">{value}</span>
    </div>
  );
}

function PickerEmpty() {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <Award className="size-7 text-amber-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Pick a customer</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        Search above to see a customer&apos;s loyalty standing — recency, frequency,
        spend, wins, and health.
      </p>
    </div>
  );
}

function StandingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 bg-neutral-100 rounded-3xl animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 bg-neutral-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-7 text-red-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load loyalty</h3>
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
