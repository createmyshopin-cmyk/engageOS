import { describe, it, expect } from "vitest";
import {
  toLoyaltyProfileDTO,
  emptyLoyaltyProfileDTO,
  type CustomerAnalyticsRow,
} from "@/server/modules/loyalty/dto";

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
    // Non-nullable counters still coerce to 0-safe numbers.
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
