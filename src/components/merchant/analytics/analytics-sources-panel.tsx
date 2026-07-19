"use client";

import { Radio } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DonutChart } from "@/components/merchant/dashboard/dashboard-charts";
import {
  EmptyRow,
  PanelError,
  PanelHeader,
  RowsSkeleton,
  UpdatingStrip,
} from "@/components/merchant/analytics/analytics-shared";
import type { AnalyticsPerformanceDTO, TrafficSourceDTO } from "@/lib/api/types";

const nf = new Intl.NumberFormat("en-IN");

const SOURCE_COLORS = ["#8B5CF6", "#16A34A", "#0EA5E9", "#F59E0B", "#EF4444", "#6366F1"];

function SourceList({ rows }: { rows: TrafficSourceDTO[] }) {
  const max = Math.max(1, ...rows.map((r) => r.qrScans));
  return (
    <ul className="divide-y divide-neutral-50">
      {rows.map((s) => (
        <li key={s.source} className="px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-neutral-900 text-sm truncate capitalize">
              {s.source || "Direct"}
            </span>
            <span className="text-[11px] font-semibold text-neutral-500 tabular-nums shrink-0">
              {nf.format(s.qrScans)} scans · {nf.format(s.plays)} plays · {nf.format(s.wins)} wins
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${(s.qrScans / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AnalyticsSourcesPanel({
  performance,
}: {
  performance: UseQueryResult<AnalyticsPerformanceDTO | undefined, Error>;
}) {
  const sources = performance.data?.sources ?? [];
  const donutSegments = sources.slice(0, 6).map((s, i) => ({
    label: s.source || "Direct",
    value: s.qrScans,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <PanelHeader
        icon={Radio}
        title="Traffic sources"
        sub="Where scans, plays and wins originate"
        tone="bg-violet-50 text-violet-600"
      />
      {performance.isFetching && !performance.isLoading && <UpdatingStrip />}
      {performance.isLoading ? (
        <RowsSkeleton />
      ) : performance.isError ? (
        <PanelError
          message={
            performance.error instanceof Error ? performance.error.message : "Failed to load sources."
          }
          onRetry={() => performance.refetch()}
        />
      ) : sources.length === 0 ? (
        <EmptyRow message="No traffic recorded yet." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-neutral-100">
          <div className="p-5 border-b lg:border-b-0 border-neutral-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-4">
              Share of scans
            </p>
            <DonutChart segments={donutSegments} size={100} />
          </div>
          <SourceList rows={sources} />
        </div>
      )}
    </section>
  );
}
