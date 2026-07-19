"use client";

import type { LucideIcon } from "lucide-react";
import { ScanLine, Ticket, TrendingUp, Users } from "lucide-react";
import { SparkLine } from "@/components/merchant/dashboard/dashboard-charts";
import type { AnalyticsOverviewDTO } from "@/lib/api/types";
import type { DailyActivityPoint } from "@/lib/merchant/daily-series";
import { KpiSkeleton } from "@/components/merchant/analytics/analytics-shared";

const nf = new Intl.NumberFormat("en-IN");

function KpiSparkCard({
  icon: Icon,
  label,
  value,
  sub,
  spark,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  spark: number[];
  color: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-neutral-50">
          <Icon className="size-4" style={{ color }} />
        </div>
        <SparkLine data={spark} color={color} />
      </div>
      <p className="text-2xl sm:text-3xl font-black mt-3 tracking-tight text-neutral-900 tabular-nums">
        {nf.format(value)}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider mt-1 text-neutral-400">{label}</p>
      <p className="text-[10px] font-semibold mt-0.5 text-neutral-500">{sub}</p>
    </div>
  );
}

export function AnalyticsKpiRow({
  overview,
  dailySeries,
  loading,
}: {
  overview: AnalyticsOverviewDTO | undefined;
  dailySeries: DailyActivityPoint[];
  loading: boolean;
}) {
  if (loading) return <KpiSkeleton />;

  const sparkRegistrations = dailySeries.map((d) => d.registrations);
  const sparkScratches = dailySeries.map((d) => d.scratches);
  const sparkCoupons = dailySeries.map((d) => d.coupons);
  const sparkRedemptions = dailySeries.map((d) => d.redemptions);

  const periodScratches = dailySeries.reduce((s, d) => s + d.scratches, 0);
  const winRate =
    overview && overview.plays > 0
      ? `${Math.round((overview.wins / overview.plays) * 100)}% win rate`
      : "No scratches yet";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiSparkCard
        icon={Users}
        label="Customers"
        value={overview?.customers ?? 0}
        sub={`${overview?.returnVisits ?? 0} return visits`}
        spark={sparkRegistrations}
        color="#16A34A"
      />
      <KpiSparkCard
        icon={ScanLine}
        label="Scratches"
        value={overview?.plays ?? 0}
        sub={periodScratches > 0 ? `${nf.format(periodScratches)} in period` : winRate}
        spark={sparkScratches}
        color="#0EA5E9"
      />
      <KpiSparkCard
        icon={Ticket}
        label="Coupons"
        value={overview?.coupons ?? 0}
        sub={`${overview?.wins ?? 0} wins`}
        spark={sparkCoupons}
        color="#8B5CF6"
      />
      <KpiSparkCard
        icon={TrendingUp}
        label="Redeemed"
        value={overview?.redeemed ?? 0}
        sub={
          overview && overview.coupons > 0
            ? `${Math.round((overview.redeemed / overview.coupons) * 100)}% of coupons`
            : "All-time total"
        }
        spark={sparkRedemptions}
        color="#F59E0B"
      />
    </div>
  );
}
