"use client";

import { Activity } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { DonutChart, FunnelChart } from "@/components/merchant/dashboard/dashboard-charts";
import {
  ChartSkeleton,
  PanelError,
  PanelHeader,
  UpdatingStrip,
} from "@/components/merchant/analytics/analytics-shared";
import type { AnalyticsOverviewDTO } from "@/lib/api/types";

export function AnalyticsFunnelPanel({
  overview,
}: {
  overview: UseQueryResult<AnalyticsOverviewDTO | undefined, Error>;
}) {
  const data = overview.data;

  return (
    <section className="lg:col-span-5 space-y-6">
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <PanelHeader
          icon={Activity}
          title="Engagement funnel"
          sub="All-time conversion through your campaigns"
          tone="bg-blue-50 text-blue-600"
        />
        {overview.isFetching && !overview.isLoading && <UpdatingStrip />}
        {overview.isLoading ? (
          <ChartSkeleton height={140} />
        ) : overview.isError ? (
          <PanelError
            message={
              overview.error instanceof Error ? overview.error.message : "Failed to load funnel."
            }
            onRetry={() => overview.refetch()}
          />
        ) : (
          <div className="p-5">
            <FunnelChart
              steps={[
                { label: "Customers", value: data?.customers ?? 0, color: "#16A34A" },
                { label: "Scratches", value: data?.plays ?? 0, color: "#0EA5E9" },
                { label: "Wins", value: data?.wins ?? 0, color: "#8B5CF6" },
                { label: "Redeemed", value: data?.redeemed ?? 0, color: "#F59E0B" },
              ]}
            />
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <PanelHeader
          icon={Activity}
          title="Win breakdown"
          sub="Wins vs non-wins across all scratches"
          tone="bg-violet-50 text-violet-600"
        />
        {overview.isLoading ? (
          <ChartSkeleton height={100} />
        ) : overview.isError ? null : (
          <div className="p-5">
            <DonutChart
              segments={[
                { label: "Wins", value: data?.wins ?? 0, color: "#16A34A" },
                {
                  label: "Losses",
                  value: data?.losses ?? Math.max((data?.plays ?? 0) - (data?.wins ?? 0), 0),
                  color: "#E5E7EB",
                },
              ]}
            />
          </div>
        )}
      </div>
    </section>
  );
}
