import { describe, it, expect } from "vitest";
import {
  toLoyaltyProfileDTO,
  toLoyaltyOverviewDTO,
  toLoyaltyLeaderboardItemDTO,
  toLoyaltyWalletDTO,
  toPointsTransactionDTO,
  toPointsRuleDTO,
  toMembershipTierDTO,
  emptyLoyaltyProfileDTO,
  emptyLoyaltyOverviewDTO,
  type CustomerAnalyticsRow,
  type LoyaltyOverviewRow,
  type LoyaltyLeaderboardRow,
} from "@/server/modules/loyalty/dto";
import { tierFromLifetimePoints, tierFromSpend, parseTierSlug } from "@/lib/loyalty/tiers";

/**
 * Phase 7 (Loyalty) — pure transformer logic for the per-customer standing.
 * The RFM/engagement aggregation runs in SQL (recompute_customer_analytics);
 * these tests pin the app-tier projection: numeric coercion, null-vs-zero
 * preservation, and the zeroed "never engaged" shape.
 */

describe("loyalty profile DTO", () => {
  const row: CustomerAnalyticsRow = {
    customer_id: "cust-1",
    total_orders: "4",
    total_spend: "5999.50",
    avg_order_value: "1499.88",
    total_plays: "12",
    total_wins: "3",
    total_redemptions: "2",
    recency_days: "7",
    frequency: "4",
    monetary: "5999.50",
    rfm_score: "555",
    health_score: "88",
    clv: "24000",
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-07-10T00:00:00Z",
    last_order_at: "2026-07-09T00:00:00Z",
    computed_at: "2026-07-11T00:00:00Z",
  };

  it("maps snake_case columns to the camelCase wire shape and coerces numbers", () => {
    const dto = toLoyaltyProfileDTO(row);
    expect(dto.totalOrders).toBe(4);
    expect(dto.totalSpend).toBe(5999.5);
    expect(dto.avgOrderValue).toBe(1499.88);
    expect(dto.totalPlays).toBe(12);
    expect(dto.recencyDays).toBe(7);
    expect(dto.rfmScore).toBe("555");
    expect(dto.healthScore).toBe(88);
    expect(dto.clv).toBe(24000);
    expect(dto.lastOrderAt).toBe("2026-07-09T00:00:00Z");
    expect(dto.computedAt).toBe("2026-07-11T00:00:00Z");
  });

  it("preserves nulls for optional metrics (distinct from 0)", () => {
    const dto = toLoyaltyProfileDTO({
      ...row,
      avg_order_value: null,
      recency_days: null,
      health_score: null,
      clv: null,
    });
    expect(dto.avgOrderValue).toBeNull();
    expect(dto.recencyDays).toBeNull();
    expect(dto.healthScore).toBeNull();
    expect(dto.clv).toBeNull();
    expect(dto.totalOrders).toBe(4);
  });

  it("emptyLoyaltyProfileDTO yields a zeroed, never-engaged standing", () => {
    const dto = emptyLoyaltyProfileDTO("cust-9");
    expect(dto.customerId).toBe("cust-9");
    expect(dto.totalOrders).toBe(0);
    expect(dto.frequency).toBe(0);
    expect(dto.avgOrderValue).toBeNull();
    expect(dto.rfmScore).toBeNull();
    expect(dto.computedAt).toBeNull();
  });
});

describe("tierFromLifetimePoints", () => {
  it("assigns tiers at lifetime-points boundaries", () => {
    expect(tierFromLifetimePoints(0)).toBe("bronze");
    expect(tierFromLifetimePoints(999)).toBe("bronze");
    expect(tierFromLifetimePoints(1_000)).toBe("silver");
    expect(tierFromLifetimePoints(2_999)).toBe("silver");
    expect(tierFromLifetimePoints(3_000)).toBe("gold");
    expect(tierFromLifetimePoints(9_999)).toBe("gold");
    expect(tierFromLifetimePoints(10_000)).toBe("platinum");
    expect(tierFromLifetimePoints(50_000)).toBe("platinum");
  });
});

describe("parseTierSlug", () => {
  it("returns slug when valid", () => {
    expect(parseTierSlug("gold")).toBe("gold");
    expect(parseTierSlug("platinum")).toBe("platinum");
  });

  it("falls back to lifetime points when slug is missing", () => {
    expect(parseTierSlug(null, 5_000)).toBe("gold");
    expect(parseTierSlug(undefined, 500)).toBe("bronze");
  });
});

describe("tierFromSpend (deprecated)", () => {
  it("still maps spend to bronze/silver/gold/platinum", () => {
    expect(tierFromSpend(0)).toBe("bronze");
    expect(tierFromSpend(5_000)).toBe("silver");
    expect(tierFromSpend(50_000)).toBe("platinum");
  });
});

describe("loyalty overview DTO", () => {
  const row: LoyaltyOverviewRow = {
    total_loyalty_members: "120",
    active_members: "45",
    total_points_issued: "5000",
    total_points_redeemed: "1200",
    reward_redemption_rate: "66.7",
    gold_count: "3",
    silver_count: "8",
    bronze_count: "15",
    member_count: "22",
    platinum_count: "5",
    repeat_purchase_rate: "40.5",
    loyalty_revenue: "850000",
    paying_customers: "48",
    avg_customer_spend: "17708.33",
    top_customer_spend: "125000",
  };

  it("maps overview RPC row to wire shape", () => {
    const dto = toLoyaltyOverviewDTO(row);
    expect(dto.totalLoyaltyMembers).toBe(120);
    expect(dto.activeMembers).toBe(45);
    expect(dto.totalPointsIssued).toBe(5000);
    expect(dto.rewardRedemptionRate).toBe(66.7);
    expect(dto.tierCounts.gold).toBe(3);
    expect(dto.tierCounts.platinum).toBe(5);
    expect(dto.loyaltyRevenue).toBe(850000);
    expect(dto.repeatPurchaseRate).toBe(40.5);
  });

  it("falls back member_count to platinum when platinum_count is null", () => {
    const dto = toLoyaltyOverviewDTO({ ...row, platinum_count: null });
    expect(dto.tierCounts.platinum).toBe(22);
  });

  it("emptyLoyaltyOverviewDTO returns zeros", () => {
    const dto = emptyLoyaltyOverviewDTO();
    expect(dto.totalLoyaltyMembers).toBe(0);
    expect(dto.tierCounts.gold).toBe(0);
    expect(dto.tierCounts.platinum).toBe(0);
    expect(dto.loyaltyRevenue).toBe(0);
  });
});

describe("loyalty wallet DTO", () => {
  it("maps wallet RPC row to wire shape with tier", () => {
    const dto = toLoyaltyWalletDTO({
      customer_id: "c1",
      full_name: "Test User",
      phone: "+911234567890",
      available_points: "150",
      lifetime_points: "3500",
      redeemed_points: "50",
      expiring_soon: "0",
      tier_slug: "gold",
      tier_name: "Gold",
      bonus_multiplier: "1.25",
      updated_at: "2026-07-12T00:00:00Z",
    });
    expect(dto.availablePoints).toBe(150);
    expect(dto.lifetimePoints).toBe(3500);
    expect(dto.redeemedPoints).toBe(50);
    expect(dto.tier).toBe("gold");
    expect(dto.tierName).toBe("Gold");
    expect(dto.bonusMultiplier).toBe(1.25);
  });

  it("maps points transaction row", () => {
    const dto = toPointsTransactionDTO({
      id: "tx-1",
      txn_type: "earn",
      source: "purchase",
      delta: 50,
      balance_after: 150,
      note: null,
      campaign_id: null,
      order_id: "ord-1",
      play_id: null,
      metadata: {},
      created_at: "2026-07-12T00:00:00Z",
      created_by: "shopify",
    });
    expect(dto.txnType).toBe("earn");
    expect(dto.delta).toBe(50);
    expect(dto.source).toBe("purchase");
  });
});

describe("points rules DTO", () => {
  it("maps rule row", () => {
    const dto = toPointsRuleDTO({
      id: "r1",
      rule_type: "purchase",
      points_per_unit: "10",
      fixed_points: null,
      multiplier: "1",
      active: true,
    });
    expect(dto.ruleType).toBe("purchase");
    expect(dto.pointsPerUnit).toBe(10);
    expect(dto.active).toBe(true);
  });
});

describe("membership tiers DTO", () => {
  it("maps tier row", () => {
    const dto = toMembershipTierDTO({
      id: "t1",
      slug: "silver",
      name: "Silver",
      min_points: "1000",
      max_points: "2999",
      color: "#94a3b8",
      icon: "crown",
      bonus_multiplier: "1.1",
      benefits: ["Free shipping"],
      sort_order: "2",
    });
    expect(dto.slug).toBe("silver");
    expect(dto.minPoints).toBe(1000);
    expect(dto.maxPoints).toBe(2999);
    expect(dto.benefits).toEqual(["Free shipping"]);
  });
});

describe("loyalty leaderboard DTO", () => {
  const row: LoyaltyLeaderboardRow = {
    rank: "1",
    customer_id: "cust-abc",
    full_name: "Priya Sharma",
    phone: "+919876543210",
    tier_slug: "gold",
    total_orders: "14",
    total_spend: "125000",
    avg_order_value: "8928.57",
    lifetime_points: "4500",
    last_order_at: "2026-07-12T00:00:00Z",
    rfm_score: "333",
    health_score: "95",
    clv: "125000",
  };

  it("maps leaderboard row with points-based tier", () => {
    const dto = toLoyaltyLeaderboardItemDTO(row);
    expect(dto.rank).toBe(1);
    expect(dto.customerId).toBe("cust-abc");
    expect(dto.name).toBe("Priya Sharma");
    expect(dto.tier).toBe("gold");
    expect(dto.lifetimePoints).toBe(4500);
    expect(dto.totalSpend).toBe(125000);
    expect(dto.totalOrders).toBe(14);
    expect(dto.healthScore).toBe(95);
  });
});
