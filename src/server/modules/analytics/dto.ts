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
