import "server-only";

import type { LoyaltyTier } from "@/lib/loyalty/tiers";
import { parseTierSlug } from "@/lib/loyalty/tiers";

export type { LoyaltyTier };
export { parseTierSlug };

/**
 * Loyalty DTOs — engagement standing + points wallet projection.
 *
 * Engagement metrics come from `customer_analytics` (0036/0069).
 * Points balances come from `customer_wallet` + `points_transactions` (0070).
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

/** Customer wallet snapshot for /m/loyalty Wallet tab. */
export interface LoyaltyWalletDTO {
  customerId: string;
  name: string | null;
  phone: string;
  availablePoints: number;
  lifetimePoints: number;
  redeemedPoints: number;
  expiringSoon: number;
  tier: LoyaltyTier;
  tierName: string;
  bonusMultiplier: number;
  updatedAt: string | null;
}

/** One row in the wallet transaction history. */
export interface PointsTransactionDTO {
  id: string;
  txnType: "earn" | "redeem" | "expire" | "adjust";
  source: string;
  delta: number;
  balanceAfter: number;
  note: string | null;
  campaignId: string | null;
  orderId: string | null;
  playId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface CustomerWalletRow {
  customer_id: string;
  full_name: string | null;
  phone: string;
  available_points: number | string | null;
  lifetime_points: number | string | null;
  redeemed_points: number | string | null;
  expiring_soon: number | string | null;
  tier_slug: string | null;
  tier_name: string | null;
  bonus_multiplier: number | string | null;
  updated_at: string | null;
}

export interface PointsTransactionRow {
  id: string;
  txn_type: string;
  source: string;
  delta: number | string;
  balance_after: number | string;
  note: string | null;
  campaign_id: string | null;
  order_id: string | null;
  play_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string;
}

export function toLoyaltyWalletDTO(row: CustomerWalletRow): LoyaltyWalletDTO {
  return {
    customerId: row.customer_id,
    name: row.full_name,
    phone: row.phone,
    availablePoints: num(row.available_points),
    lifetimePoints: num(row.lifetime_points),
    redeemedPoints: num(row.redeemed_points),
    expiringSoon: num(row.expiring_soon),
    tier: parseTierSlug(row.tier_slug, num(row.lifetime_points)),
    tierName: row.tier_name ?? "Bronze",
    bonusMultiplier: num(row.bonus_multiplier) || 1,
    updatedAt: row.updated_at,
  };
}

export function emptyLoyaltyWalletDTO(customerId: string, phone = ""): LoyaltyWalletDTO {
  return {
    customerId,
    name: null,
    phone,
    availablePoints: 0,
    lifetimePoints: 0,
    redeemedPoints: 0,
    expiringSoon: 0,
    tier: "bronze",
    tierName: "Bronze",
    bonusMultiplier: 1,
    updatedAt: null,
  };
}

export function toPointsTransactionDTO(row: PointsTransactionRow): PointsTransactionDTO {
  const txnType = row.txn_type as PointsTransactionDTO["txnType"];
  return {
    id: row.id,
    txnType,
    source: row.source,
    delta: num(row.delta),
    balanceAfter: num(row.balance_after),
    note: row.note,
    campaignId: row.campaign_id,
    orderId: row.order_id,
    playId: row.play_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** Dashboard KPI snapshot for /m/loyalty. */
export interface LoyaltyOverviewDTO {
  totalLoyaltyMembers: number;
  activeMembers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  rewardRedemptionRate: number;
  tierCounts: { bronze: number; silver: number; gold: number; platinum: number };
  repeatPurchaseRate: number;
  loyaltyRevenue: number;
  payingCustomers: number;
  avgCustomerSpend: number;
  topCustomerSpend: number;
}

/** One row in the top-paying-customers leaderboard. */
export interface LoyaltyLeaderboardItemDTO {
  rank: number;
  customerId: string;
  name: string | null;
  phone: string;
  tier: LoyaltyTier;
  totalSpend: number;
  totalOrders: number;
  avgOrderValue: number | null;
  lifetimePoints: number;
  lastOrderAt: string | null;
  rfmScore: string | null;
  healthScore: number | null;
  clv: number | null;
}

/** Raw row from loyalty_overview(p_business_id). */
export interface LoyaltyOverviewRow {
  total_loyalty_members: number | string | null;
  active_members: number | string | null;
  total_points_issued: number | string | null;
  total_points_redeemed: number | string | null;
  reward_redemption_rate: number | string | null;
  gold_count: number | string | null;
  silver_count: number | string | null;
  bronze_count: number | string | null;
  member_count: number | string | null;
  platinum_count: number | string | null;
  repeat_purchase_rate: number | string | null;
  loyalty_revenue: number | string | null;
  paying_customers: number | string | null;
  avg_customer_spend: number | string | null;
  top_customer_spend: number | string | null;
}

/** Raw row from loyalty_leaderboard(...). */
export interface LoyaltyLeaderboardRow {
  rank: number | string;
  customer_id: string;
  full_name: string | null;
  phone: string;
  tier_slug: string | null;
  total_orders: number | string | null;
  total_spend: number | string | null;
  avg_order_value: number | string | null;
  lifetime_points: number | string | null;
  last_order_at: string | null;
  rfm_score: string | null;
  health_score: number | string | null;
  clv: number | string | null;
}

export function toLoyaltyOverviewDTO(row: LoyaltyOverviewRow): LoyaltyOverviewDTO {
  return {
    totalLoyaltyMembers: num(row.total_loyalty_members),
    activeMembers: num(row.active_members),
    totalPointsIssued: num(row.total_points_issued),
    totalPointsRedeemed: num(row.total_points_redeemed),
    rewardRedemptionRate: num(row.reward_redemption_rate),
    tierCounts: {
      bronze: num(row.bronze_count),
      silver: num(row.silver_count),
      gold: num(row.gold_count),
      platinum: num(row.platinum_count ?? row.member_count),
    },
    repeatPurchaseRate: num(row.repeat_purchase_rate),
    loyaltyRevenue: num(row.loyalty_revenue),
    payingCustomers: num(row.paying_customers),
    avgCustomerSpend: num(row.avg_customer_spend),
    topCustomerSpend: num(row.top_customer_spend),
  };
}

export function toLoyaltyLeaderboardItemDTO(row: LoyaltyLeaderboardRow): LoyaltyLeaderboardItemDTO {
  const totalSpend = num(row.total_spend);
  const lifetimePoints = num(row.lifetime_points);
  return {
    rank: num(row.rank),
    customerId: row.customer_id,
    name: row.full_name,
    phone: row.phone,
    tier: parseTierSlug(row.tier_slug, lifetimePoints),
    totalSpend,
    totalOrders: num(row.total_orders),
    avgOrderValue: numOrNull(row.avg_order_value),
    lifetimePoints,
    lastOrderAt: row.last_order_at,
    rfmScore: row.rfm_score,
    healthScore: numOrNull(row.health_score),
    clv: numOrNull(row.clv),
  };
}

/** Zeroed overview when the business has no loyalty activity yet. */
export function emptyLoyaltyOverviewDTO(): LoyaltyOverviewDTO {
  return {
    totalLoyaltyMembers: 0,
    activeMembers: 0,
    totalPointsIssued: 0,
    totalPointsRedeemed: 0,
    rewardRedemptionRate: 0,
    tierCounts: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    repeatPurchaseRate: 0,
    loyaltyRevenue: 0,
    payingCustomers: 0,
    avgCustomerSpend: 0,
    topCustomerSpend: 0,
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

/** Merchant-configurable earn rule. */
export interface PointsRuleDTO {
  id: string;
  ruleType: string;
  pointsPerUnit: number | null;
  fixedPoints: number | null;
  multiplier: number;
  active: boolean;
}

export interface PointsRuleRow {
  id: string;
  rule_type: string;
  points_per_unit: number | string | null;
  fixed_points: number | string | null;
  multiplier: number | string | null;
  active: boolean;
}

export function toPointsRuleDTO(row: PointsRuleRow): PointsRuleDTO {
  return {
    id: row.id,
    ruleType: row.rule_type,
    pointsPerUnit: row.points_per_unit == null ? null : num(row.points_per_unit),
    fixedPoints: row.fixed_points == null ? null : num(row.fixed_points),
    multiplier: num(row.multiplier) || 1,
    active: row.active,
  };
}

/** Membership tier config. */
export interface MembershipTierDTO {
  id: string;
  slug: LoyaltyTier;
  name: string;
  minPoints: number;
  maxPoints: number | null;
  color: string;
  icon: string;
  bonusMultiplier: number;
  benefits: string[];
  sortOrder: number;
}

export interface MembershipTierRow {
  id: string;
  slug: string;
  name: string;
  min_points: number | string;
  max_points: number | string | null;
  color: string;
  icon: string;
  bonus_multiplier: number | string;
  benefits: string[] | unknown;
  sort_order: number | string;
}

export function toMembershipTierDTO(row: MembershipTierRow): MembershipTierDTO {
  const benefits = Array.isArray(row.benefits)
    ? row.benefits.filter((b): b is string => typeof b === "string")
    : [];
  return {
    id: row.id,
    slug: parseTierSlug(row.slug),
    name: row.name,
    minPoints: num(row.min_points),
    maxPoints: row.max_points == null ? null : num(row.max_points),
    color: row.color,
    icon: row.icon,
    bonusMultiplier: num(row.bonus_multiplier) || 1,
    benefits,
    sortOrder: num(row.sort_order),
  };
}
