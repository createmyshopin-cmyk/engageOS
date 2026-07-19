"use client";

/**
 * AnalyticsView — the merchant analytics surface for `/m/analytics`.
 *
 * Combines overview KPIs, daily trends, funnel charts, campaign leaderboard
 * and traffic-source breakdown via the v1 analytics API (React Query).
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAnalyticsOverview } from "@/lib/api/hooks/use-dashboard";
import { useAnalyticsPerformance } from "@/lib/api/hooks/use-analytics";
import { useAnalyticsTrends } from "@/lib/api/hooks/use-analytics-trends";
import { CampaignsSectionNav } from "@/components/merchant/campaigns/campaigns-section-nav";
import { AnalyticsKpiRow } from "@/components/merchant/analytics/analytics-kpi-row";
import { AnalyticsTrendsPanel } from "@/components/merchant/analytics/analytics-trends-panel";
import { AnalyticsFunnelPanel } from "@/components/merchant/analytics/analytics-funnel-panel";
import { AnalyticsCampaignTable } from "@/components/merchant/analytics/analytics-campaign-table";
import { AnalyticsShopifyPanel } from "@/components/merchant/analytics/analytics-shopify-panel";
import { AnalyticsSourcesPanel } from "@/components/merchant/analytics/analytics-sources-panel";
import { fillDailySeries } from "@/lib/merchant/daily-series";
import { PanelError } from "@/components/merchant/analytics/analytics-shared";

export function AnalyticsView() {
  const [trendDays, setTrendDays] = useState(7);
  const overview = useAnalyticsOverview();
  const performance = useAnalyticsPerformance();
  const trends = useAnalyticsTrends(trendDays);

  const refreshing = overview.isFetching || performance.isFetching || trends.isFetching;

  const dailySeries = useMemo(
    () => fillDailySeries(trends.data?.series ?? [], trendDays),
    [trends.data?.series, trendDays]
  );

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Analytics</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Engagement, campaign performance and where your traffic comes from.
          </p>
        </div>
        {refreshing && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      <CampaignsSectionNav />

      {overview.isError && !overview.isLoading ? (
        <PanelError
          message={overview.error instanceof Error ? overview.error.message : "Failed to load KPIs."}
          onRetry={() => overview.refetch()}
        />
      ) : (
        <AnalyticsKpiRow
          overview={overview.data}
          dailySeries={dailySeries}
          loading={overview.isLoading || trends.isLoading}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <AnalyticsTrendsPanel trends={trends} days={trendDays} onDaysChange={setTrendDays} />
        <AnalyticsFunnelPanel overview={overview} />
      </div>

      <AnalyticsCampaignTable performance={performance} />
      <AnalyticsShopifyPanel />
      <AnalyticsSourcesPanel performance={performance} />
    </div>
  );
}
