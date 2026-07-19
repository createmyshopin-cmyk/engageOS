"use client";

import {
  Users,
  UserCheck,
  Coins,
  Gift,
  Percent,
  Crown,
  Repeat,
  IndianRupee,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useLoyaltyOverview } from "@/lib/api/hooks/use-loyalty-overview";
import type { LoyaltyOverviewDTO } from "@/lib/api/types";
import { LoyaltyTierBadge } from "@/components/merchant/loyalty/loyalty-tier-badge";

const nf = new Intl.NumberFormat("en-IN");

function money(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function LoyaltyDashboard() {
  const overview = useLoyaltyOverview();

  if (overview.isLoading) return <KpiSkeleton />;
  if (overview.isError) {
    return (
      <PanelError
        message={
          overview.error instanceof Error ? overview.error.message : "Failed to load loyalty KPIs."
        }
        onRetry={overview.refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid data={overview.data} />
      <TierDistribution data={overview.data} />
    </div>
  );
}

function KpiGrid({ data }: { data: LoyaltyOverviewDTO | undefined }) {
  const items = [
    {
      icon: Users,
      label: "Loyalty Members",
      value: nf.format(data?.totalLoyaltyMembers ?? 0),
      tone: "bg-blue-50 text-blue-600",
    },
    {
      icon: UserCheck,
      label: "Active Members",
      value: nf.format(data?.activeMembers ?? 0),
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      icon: Coins,
      label: "Points Issued",
      value: nf.format(data?.totalPointsIssued ?? 0),
      tone: "bg-violet-50 text-violet-600",
    },
    {
      icon: Gift,
      label: "Points Redeemed",
      value: nf.format(data?.totalPointsRedeemed ?? 0),
      tone: "bg-pink-50 text-pink-600",
    },
    {
      icon: Percent,
      label: "Redemption Rate",
      value: `${data?.rewardRedemptionRate ?? 0}%`,
      tone: "bg-teal-50 text-teal-600",
    },
    {
      icon: Repeat,
      label: "Repeat Purchase",
      value: `${data?.repeatPurchaseRate ?? 0}%`,
      tone: "bg-rose-50 text-rose-600",
    },
    {
      icon: IndianRupee,
      label: "Loyalty Revenue",
      value: money(data?.loyaltyRevenue ?? 0),
      tone: "bg-amber-50 text-amber-600",
    },
    {
      icon: Crown,
      label: "Paying Customers",
      value: nf.format(data?.payingCustomers ?? 0),
      tone: "bg-indigo-50 text-indigo-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4"
        >
          <div className={`flex items-center justify-center size-9 rounded-xl ${it.tone}`}>
            <it.icon className="size-4.5" />
          </div>
          <p className="text-xl font-black text-neutral-900 mt-3 tracking-tight">{it.value}</p>
          <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">{it.label}</p>
        </div>
      ))}
    </div>
  );
}

function TierDistribution({ data }: { data: LoyaltyOverviewDTO | undefined }) {
  const tiers = [
    { tier: "platinum" as const, count: data?.tierCounts.platinum ?? 0 },
    { tier: "gold" as const, count: data?.tierCounts.gold ?? 0 },
    { tier: "silver" as const, count: data?.tierCounts.silver ?? 0 },
    { tier: "bronze" as const, count: data?.tierCounts.bronze ?? 0 },
  ];
  const total = tiers.reduce((s, t) => s + t.count, 0) || 1;

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-black text-neutral-900">Tier Distribution</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Points-based tiers — Platinum 10k+, Gold 3k+, Silver 1k+
          </p>
        </div>
        {data && data.avgCustomerSpend > 0 && (
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">Avg spend</p>
            <p className="text-sm font-black text-neutral-900">{money(data.avgCustomerSpend)}</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiers.map((t) => (
          <div
            key={t.tier}
            className="rounded-2xl border border-neutral-100 bg-neutral-50/50 px-4 py-3"
          >
            <LoyaltyTierBadge tier={t.tier} />
            <p className="text-2xl font-black text-neutral-900 mt-2">{nf.format(t.count)}</p>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.round((t.count / total) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] font-semibold text-neutral-400 mt-1">
              {Math.round((t.count / total) * 100)}%
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 bg-neutral-100 rounded-3xl animate-pulse" />
      ))}
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-12 px-8 text-center">
      <div className="size-12 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
        <AlertTriangle className="size-6 text-red-400" />
      </div>
      <p className="text-xs text-neutral-500 max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-neutral-800 transition"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
