import "server-only";

/**
 * Loyalty DTOs — the wire shape for a customer's loyalty/engagement standing.
 *
 * There is no separate points ledger in the schema; loyalty in this CDP is the
 * derived RFM + engagement model computed into `customer_analytics` (0036) by
 * `recompute_customer_analytics`. This DTO is a display projection of that
 * precomputed row — it NEVER recomputes and never double-counts reward grants.
 */

export interface LoyaltyProfileDTO {
  customerId: string;
  totalOrders: number;
  totalSpend: number;
  avgOrderValue: number | null;
  totalPlays: number;
  totalWins: number;
  totalRedemptions: number;
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  rfmScore: string | null;
  healthScore: number | null;
  clv: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastOrderAt: string | null;
  computedAt: string | null;
}

/** Row shape selected from customer_analytics (tenant-scoped). */
export interface CustomerAnalyticsRow {
  customer_id: string;
  total_orders: number | string | null;
  total_spend: number | string | null;
  avg_order_value: number | string | null;
  total_plays: number | string | null;
  total_wins: number | string | null;
  total_redemptions: number | string | null;
  recency_days: number | string | null;
  frequency: number | string | null;
  monetary: number | string | null;
  rfm_score: string | null;
  health_score: number | string | null;
  clv: number | string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_order_at: string | null;
  computed_at: string | null;
}

const num = (x: unknown): number => Number(x) || 0;
const numOrNull = (x: unknown): number | null => (x == null ? null : Number(x) || 0);

export function toLoyaltyProfileDTO(row: CustomerAnalyticsRow): LoyaltyProfileDTO {
  return {
    customerId: row.customer_id,
    totalOrders: num(row.total_orders),
    totalSpend: num(row.total_spend),
    avgOrderValue: numOrNull(row.avg_order_value),
    totalPlays: num(row.total_plays),
    totalWins: num(row.total_wins),
    totalRedemptions: num(row.total_redemptions),
    recencyDays: numOrNull(row.recency_days),
    frequency: num(row.frequency),
    monetary: num(row.monetary),
    rfmScore: row.rfm_score,
    healthScore: numOrNull(row.health_score),
    clv: numOrNull(row.clv),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastOrderAt: row.last_order_at,
    computedAt: row.computed_at,
  };
}

/** The zeroed standing for a customer with no analytics row yet (never seen). */
export function emptyLoyaltyProfileDTO(customerId: string): LoyaltyProfileDTO {
  return {
    customerId,
    totalOrders: 0,
    totalSpend: 0,
    avgOrderValue: null,
    totalPlays: 0,
    totalWins: 0,
    totalRedemptions: 0,
    recencyDays: null,
    frequency: 0,
    monetary: 0,
    rfmScore: null,
    healthScore: null,
    clv: null,
    firstSeenAt: null,
    lastSeenAt: null,
    lastOrderAt: null,
    computedAt: null,
  };
}
