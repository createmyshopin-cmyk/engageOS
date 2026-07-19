import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { AnalyticsRepository } from "@/server/modules/analytics/repository";
import {
  toAnalyticsOverviewDTO,
  toCampaignPerformanceDTO,
  toDailyActivityDTO,
  toTrafficSourceDTO,
  type AnalyticsOverviewDTO,
  type AnalyticsPerformanceDTO,
  type AnalyticsTrendsDTO,
} from "@/server/modules/analytics/dto";

/**
 * AnalyticsService — merchant reporting read models.
 *
 * Thin layer over the aggregate RPCs: it shapes DB rows into the wire DTO and
 * nothing more. No row-level computation happens here — the heavy lifting is in
 * SQL, so this scales with the event volume the DB can aggregate, not with what
 * the app can hold in memory.
 */
export class AnalyticsService extends Service {
  private readonly repo: AnalyticsRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new AnalyticsRepository(tenant);
  }

  /** KPI snapshot for the dashboard overview. */
  async overview(): Promise<AnalyticsOverviewDTO> {
    const totals = await this.repo.businessTotals();
    return toAnalyticsOverviewDTO(totals);
  }

  /** Campaign leaderboard + traffic-source breakdown (one round-trip each). */
  async performance(): Promise<AnalyticsPerformanceDTO> {
    const [campaigns, sources] = await Promise.all([
      this.repo.campaignPerformance(),
      this.repo.trafficSources(),
    ]);
    return {
      campaigns: campaigns.map(toCampaignPerformanceDTO),
      sources: sources.map(toTrafficSourceDTO),
    };
  }

  /** Daily activity series for trend charts (clamped 1–90 days). */
  async trends(days: number): Promise<AnalyticsTrendsDTO> {
    const clamped = Math.max(1, Math.min(days, 90));
    const rows = await this.repo.dailyActivity(clamped);
    return {
      days: clamped,
      series: rows.map(toDailyActivityDTO),
    };
  }
}
