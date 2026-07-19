import "server-only";

/**
 * Wire shape of the analytics overview — the merchant dashboard KPI snapshot.
 * Sourced entirely from the DB-side `business_event_totals` aggregate RPC
 * (immutable event log), never recomputed in the app tier. Tenant-scoped.
 */
export interface AnalyticsOverviewDTO {
  customers: number;
  plays: number;
  wins: number;
  losses: number;
  coupons: number;
  redeemed: number;
  returnVisits: number;
}

/** Raw row returned by business_event_totals(p_business_id). */
export interface BusinessTotalsRow {
  customers: number;
  plays: number;
  wins: number;
  losses: number;
  coupons: number;
  redeemed: number;
  return_visits: number;
}

export function toAnalyticsOverviewDTO(row: BusinessTotalsRow): AnalyticsOverviewDTO {
  return {
    customers: Number(row.customers) || 0,
    plays: Number(row.plays) || 0,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    coupons: Number(row.coupons) || 0,
    redeemed: Number(row.redeemed) || 0,
    returnVisits: Number(row.return_visits) || 0,
  };
}

/**
 * The analytics "performance" surface — a campaign leaderboard plus a traffic-
 * source breakdown, both sourced from existing tenant aggregate RPCs
 * (campaign_performance, traffic_sources). No new SQL; this DTO only reshapes
 * the already-normalized rows into camelCase wire types.
 */
export interface CampaignPerformanceDTO {
  campaignId: string;
  campaignName: string;
  status: string;
  totalEvents: number;
  scans: number;
  registrations: number;
  scratches: number;
  redemptions: number;
  lastActivity: string | null;
}

export interface TrafficSourceDTO {
  source: string;
  qrScans: number;
  registrations: number;
  plays: number;
  wins: number;
  redemptions: number;
}

export interface AnalyticsPerformanceDTO {
  campaigns: CampaignPerformanceDTO[];
  sources: TrafficSourceDTO[];
}

/** Row shape from TenantRepository.campaignPerformance() (already coerced). */
export interface CampaignPerformanceRowLike {
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  total_events: number;
  scans: number;
  registrations: number;
  scratches: number;
  redemptions: number;
  last_activity: string | null;
}

/** Row shape from TenantRepository.trafficSources() (already coerced). */
export interface TrafficSourceRowLike {
  source: string;
  qr_scans: number;
  registrations: number;
  plays: number;
  wins: number;
  redemptions: number;
}

export function toCampaignPerformanceDTO(row: CampaignPerformanceRowLike): CampaignPerformanceDTO {
  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.campaign_status,
    totalEvents: Number(row.total_events) || 0,
    scans: Number(row.scans) || 0,
    registrations: Number(row.registrations) || 0,
    scratches: Number(row.scratches) || 0,
    redemptions: Number(row.redemptions) || 0,
    lastActivity: row.last_activity,
  };
}

export function toTrafficSourceDTO(row: TrafficSourceRowLike): TrafficSourceDTO {
  return {
    source: row.source,
    qrScans: Number(row.qr_scans) || 0,
    registrations: Number(row.registrations) || 0,
    plays: Number(row.plays) || 0,
    wins: Number(row.wins) || 0,
    redemptions: Number(row.redemptions) || 0,
  };
}

/** One day of business-wide funnel activity (business_daily_activity RPC). */
export interface DailyActivityDTO {
  day: string;
  registrations: number;
  scratches: number;
  coupons: number;
  redemptions: number;
}

export interface AnalyticsTrendsDTO {
  days: number;
  series: DailyActivityDTO[];
}

/** Row shape from TenantRepository.businessDailyActivity(). */
export interface DailyActivityRowLike {
  day: string;
  registrations: number;
  scratches: number;
  coupons: number;
  redemptions: number;
}

export function toDailyActivityDTO(row: DailyActivityRowLike): DailyActivityDTO {
  return {
    day: row.day,
    registrations: Number(row.registrations) || 0,
    scratches: Number(row.scratches) || 0,
    coupons: Number(row.coupons) || 0,
    redemptions: Number(row.redemptions) || 0,
  };
}
