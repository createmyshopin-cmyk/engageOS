"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Coins,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Minus,
  History,
  Clock,
  Gift,
} from "lucide-react";
import { useCustomerList, flattenCustomerPages } from "@/lib/api/hooks/use-customers";
import { useLoyaltyWallet } from "@/lib/api/hooks/use-loyalty-wallet";
import { usePointsHistory, useAdjustPoints } from "@/lib/api/hooks/use-loyalty-history";
import type { CustomerListItemDTO, PointsTransactionDTO, LoyaltyWalletDTO } from "@/lib/api/types";
import { LoyaltyTierBadge } from "@/components/merchant/loyalty/loyalty-tier-badge";

const nf = new Intl.NumberFormat("en-IN");

const SOURCE_LABELS: Record<string, string> = {
  purchase: "Shopify Purchase",
  signup: "Signup Bonus",
  first_purchase: "First Purchase",
  campaign_play: "Campaign Win",
  manual: "Manual Adjustment",
};

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LoyaltyWalletPanel() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState<CustomerListItemDTO | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const list = useCustomerList({ search: debounced });
  const results = flattenCustomerPages(list.data?.pages).slice(0, 8);
  const wallet = useLoyaltyWallet(selected?.id ?? null);
  const history = usePointsHistory(selected?.id ?? null);
  const adjust = useAdjustPoints(selected?.id ?? null);

  async function handleAdjust(sign: 1 | -1) {
    const amount = parseInt(adjustDelta, 10);
    if (!selected || !Number.isFinite(amount) || amount <= 0) return;
    await adjust.mutateAsync({
      delta: amount * sign,
      note: adjustNote.trim() || undefined,
    });
    setAdjustDelta("");
    setAdjustNote("");
  }

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
          placeholder="Search customer to view wallet…"
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
        <EmptyPicker />
      ) : wallet.isLoading ? (
        <WalletSkeleton />
      ) : wallet.isError ? (
        <ErrorState
          message={wallet.error instanceof Error ? wallet.error.message : "Failed to load wallet."}
          onRetry={wallet.refetch}
        />
      ) : wallet.data ? (
        <div className="space-y-4">
          <WalletHeader customer={selected} data={wallet.data} />
          <ManualAdjust
            delta={adjustDelta}
            note={adjustNote}
            onDeltaChange={setAdjustDelta}
            onNoteChange={setAdjustNote}
            onAdd={() => handleAdjust(1)}
            onDeduct={() => handleAdjust(-1)}
            busy={adjust.isPending}
            error={adjust.error}
          />
          <HistoryPanel
            rows={history.data ?? []}
            loading={history.isLoading}
            error={history.error}
            onRetry={history.refetch}
          />
        </div>
      ) : null}
    </div>
  );
}

function WalletHeader({
  customer,
  data,
}: {
  customer: CustomerListItemDTO;
  data: LoyaltyWalletDTO;
}) {
  const cards = [
    { icon: Coins, label: "Available", value: data.availablePoints, tone: "bg-emerald-50 text-emerald-600" },
    { icon: Gift, label: "Lifetime", value: data.lifetimePoints, tone: "bg-violet-50 text-violet-600" },
    { icon: History, label: "Redeemed", value: data.redeemedPoints, tone: "bg-pink-50 text-pink-600" },
    { icon: Clock, label: "Expiring Soon", value: data.expiringSoon, tone: "bg-amber-50 text-amber-600" },
  ];

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-neutral-900">{customer.name ?? "Unnamed"}</p>
          <p className="text-[11px] text-neutral-500">{customer.phone}</p>
        </div>
        <div className="text-right">
          <LoyaltyTierBadge tier={data.tier} />
          <p className="text-[10px] font-semibold text-neutral-400 mt-1">
            {data.tierName} · {data.bonusMultiplier}x bonus
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-3">
            <div className={`inline-flex items-center justify-center size-8 rounded-xl ${c.tone}`}>
              <c.icon className="size-4" />
            </div>
            <p className="text-xl font-black text-neutral-900 mt-2">{nf.format(c.value)}</p>
            <p className="text-[10px] font-semibold text-neutral-500">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ManualAdjust({
  delta,
  note,
  onDeltaChange,
  onNoteChange,
  onAdd,
  onDeduct,
  busy,
  error,
}: {
  delta: string;
  note: string;
  onDeltaChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onAdd: () => void;
  onDeduct: () => void;
  busy: boolean;
  error: Error | null;
}) {
  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5">
      <h3 className="text-sm font-black text-neutral-900 mb-3">Manual Adjustment</h3>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="number"
          min={1}
          value={delta}
          onChange={(e) => onDeltaChange(e.target.value)}
          placeholder="Points"
          className="flex-1 px-3 py-2 rounded-xl border border-neutral-200 text-sm"
        />
        <input
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Note (optional)"
          className="flex-[2] px-3 py-2 rounded-xl border border-neutral-200 text-sm"
        />
        <button
          onClick={onAdd}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Add
        </button>
        <button
          onClick={onDeduct}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-50"
        >
          <Minus className="size-3.5" /> Deduct
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-500 mt-2">
          {error instanceof Error ? error.message : "Adjustment failed"}
        </p>
      )}
    </section>
  );
}

function HistoryPanel({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: PointsTransactionDTO[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100">
        <h3 className="text-sm font-black text-neutral-900">Wallet History</h3>
        <p className="text-[11px] text-neutral-500">Earn, redeem, and adjustment log</p>
      </div>
      {loading ? (
        <div className="p-8 flex justify-center">
          <Loader2 className="size-6 animate-spin text-neutral-300" />
        </div>
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load history."}
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <p className="text-xs text-neutral-400 text-center py-10">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-50 max-h-96 overflow-auto">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-neutral-900">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </p>
                <p className="text-[10px] text-neutral-400">{shortDate(row.createdAt)}</p>
                {row.note && (
                  <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{row.note}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-black tabular-nums ${
                    row.delta >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {row.delta >= 0 ? "+" : ""}
                  {nf.format(row.delta)}
                </p>
                <p className="text-[10px] text-neutral-400">bal {nf.format(row.balanceAfter)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyPicker() {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <Coins className="size-10 text-amber-300 mb-3" />
      <h3 className="font-black text-neutral-900 text-sm">Select a customer</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">
        Search above to view their points balance, history, and make manual adjustments.
      </p>
    </div>
  );
}

function WalletSkeleton() {
  return <div className="h-48 bg-neutral-100 rounded-3xl animate-pulse" />;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
      <AlertTriangle className="size-8 text-red-300 mb-2" />
      <p className="text-xs text-neutral-500">{message}</p>
      <button
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-neutral-700"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
