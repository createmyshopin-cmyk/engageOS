"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  AreaTrendChart,
  type ChartPoint,
} from "@/components/merchant/dashboard/dashboard-charts";
import {
  ChartSkeleton,
  EmptyRow,
  PanelError,
  UpdatingStrip,
} from "@/components/merchant/analytics/analytics-shared";
import type { AnalyticsTrendsDTO } from "@/lib/api/types";
import { dayLabel, fillDailySeries } from "@/lib/merchant/daily-series";

type ChartMetric = "registrations" | "scratches" | "coupons" | "redemptions";

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "registrations", label: "Sign-ups" },
  { key: "scratches", label: "Scratches" },
  { key: "coupons", label: "Coupons" },
  { key: "redemptions", label: "Redeemed" },
];

export function AnalyticsTrendsPanel({
  trends,
  days,
  onDaysChange,
}: {
  trends: UseQueryResult<AnalyticsTrendsDTO | undefined, Error>;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>("scratches");

  const filled = useMemo(
    () => fillDailySeries(trends.data?.series ?? [], days),
    [trends.data?.series, days]
  );

  const chartSeries: ChartPoint[] = filled.map((d) => ({
    label: dayLabel(d.day),
    value: d[chartMetric],
  }));

  return (
    <section className="lg:col-span-7 bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-xl bg-emerald-50 text-emerald-600">
            <BarChart3 className="size-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-neutral-900">Activity trends</h2>
            <p className="text-[11px] font-medium text-neutral-400">Daily funnel from your event log</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onDaysChange(p.days)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                days === p.days
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {trends.isFetching && !trends.isLoading && <UpdatingStrip />}

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {CHART_METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setChartMetric(m.key)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                chartMetric === m.key
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {trends.isLoading ? (
          <ChartSkeleton />
        ) : trends.isError ? (
          <PanelError
            message={trends.error instanceof Error ? trends.error.message : "Failed to load trends."}
            onRetry={() => trends.refetch()}
          />
        ) : filled.every((d) => d.registrations + d.scratches + d.coupons + d.redemptions === 0) ? (
          <EmptyRow message="No activity in this period yet." />
        ) : (
          <AreaTrendChart series={chartSeries} />
        )}
      </div>
    </section>
  );
}
