"use client";

import Link from "next/link";
import {
  Trophy,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useLoyaltyLeaderboard } from "@/lib/api/hooks/use-loyalty-leaderboard";
import type { LoyaltyLeaderboardItemDTO } from "@/lib/api/types";
import { LoyaltyTierBadge } from "@/components/merchant/loyalty/loyalty-tier-badge";

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

export function LoyaltyLeaderboard({
  onSelect,
  selectedId,
}: {
  onSelect: (row: LoyaltyLeaderboardItemDTO) => void;
  selectedId?: string | null;
}) {
  const leaderboard = useLoyaltyLeaderboard({ limit: 20 });

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-xl bg-amber-50 text-amber-600">
            <Trophy className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-neutral-900">Top Paying Customers</h2>
            <p className="text-[11px] text-neutral-500">Ranked by lifetime Shopify spend</p>
          </div>
        </div>
        {leaderboard.isFetching && !leaderboard.isLoading && (
          <Loader2 className="size-4 animate-spin text-neutral-300" />
        )}
      </div>

      {leaderboard.isLoading ? (
        <RowsSkeleton />
      ) : leaderboard.isError ? (
        <PanelError
          message={
            leaderboard.error instanceof Error
              ? leaderboard.error.message
              : "Failed to load leaderboard."
          }
          onRetry={leaderboard.refetch}
        />
      ) : !leaderboard.data || leaderboard.data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide border-b border-neutral-100">
                <th className="text-left font-bold px-5 py-3 w-12">#</th>
                <th className="text-left font-bold px-3 py-3">Customer</th>
                <th className="text-left font-bold px-3 py-3">Tier</th>
                <th className="text-right font-bold px-3 py-3">Spend</th>
                <th className="text-right font-bold px-3 py-3">Points</th>
                <th className="text-right font-bold px-3 py-3">Orders</th>
                <th className="text-right font-bold px-5 py-3">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {leaderboard.data.map((row) => (
                <tr
                  key={row.customerId}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer transition-colors ${
                    selectedId === row.customerId
                      ? "bg-emerald-50/80"
                      : "hover:bg-neutral-50/60"
                  }`}
                >
                  <td className="px-5 py-3 font-black text-neutral-400 tabular-nums">{row.rank}</td>
                  <td className="px-3 py-3 min-w-0">
                    <p className="font-bold text-neutral-900 truncate max-w-[160px]">
                      {row.name ?? "Unnamed"}
                    </p>
                    <p className="text-[10px] text-neutral-400">{row.phone}</p>
                  </td>
                  <td className="px-3 py-3">
                    <LoyaltyTierBadge tier={row.tier} />
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-neutral-900 tabular-nums">
                    {money(row.totalSpend)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-violet-700 tabular-nums">
                    {row.lifetimePoints.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                    {row.totalOrders}
                  </td>
                  <td className="px-5 py-3 text-right text-[11px] font-medium text-neutral-400 tabular-nums">
                    {shortDate(row.lastOrderAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
      <Trophy className="size-10 text-neutral-200 mb-3" />
      <h3 className="font-black text-neutral-900 text-sm">No paying customers yet</h3>
      <p className="text-xs text-neutral-500 max-w-sm mt-1">
        Connect Shopify and sync orders — spend rankings will populate automatically.
      </p>
      <Link
        href="/m/shopify"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700"
      >
        Go to Shopify <ExternalLink className="size-3.5" />
      </Link>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-neutral-50">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-neutral-50 animate-pulse mx-5 my-1 rounded-xl" />
      ))}
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
