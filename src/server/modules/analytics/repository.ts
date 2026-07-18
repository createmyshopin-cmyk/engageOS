import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type {
  BusinessTotalsRow,
  CampaignPerformanceRowLike,
  TrafficSourceRowLike,
} from "@/server/modules/analytics/dto";

/**
 * AnalyticsRepository — read-only aggregate access for merchant reporting.
 *
 * Every metric is served by a DB-side SECURITY DEFINER aggregate RPC over the
 * immutable event log; rows are NEVER pulled into the app tier and summed here.
 * Tenant-scoped via the bound TenantRepository — physically cannot read another
 * business's totals.
 */
export class AnalyticsRepository extends Repository {
  constructor(private readonly tenantRepo: TenantRepository) {
    super(tenantRepo);
  }

  /** Business-wide KPI totals from the event log (dashboard overview). */
  async businessTotals(): Promise<BusinessTotalsRow> {
    const row = await this.rpcOne<BusinessTotalsRow>("business_event_totals", {
      p_business_id: this.businessId,
    });
    // A tenant with no events yet returns no row — normalize to zeros.
    return (
      row ?? {
        customers: 0,
        plays: 0,
        wins: 0,
        losses: 0,
        coupons: 0,
        redeemed: 0,
        return_visits: 0,
      }
    );
  }

  /** Per-campaign leaderboard (reuses the existing campaign_performance RPC). */
  async campaignPerformance(): Promise<CampaignPerformanceRowLike[]> {
    return this.tenantRepo.campaignPerformance();
  }

  /** Traffic-source breakdown (reuses the existing traffic_sources RPC). */
  async trafficSources(): Promise<TrafficSourceRowLike[]> {
    return this.tenantRepo.trafficSources();
  }
}
