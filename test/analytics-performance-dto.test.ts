import { describe, it, expect } from "vitest";
import {
  toCampaignPerformanceDTO,
  toDailyActivityDTO,
  toTrafficSourceDTO,
  type CampaignPerformanceRowLike,
  type DailyActivityRowLike,
  type TrafficSourceRowLike,
} from "@/server/modules/analytics/dto";

/**
 * Phase 8 (Analytics performance) — pure transformer logic for the campaign
 * leaderboard + traffic-source breakdown. The aggregation itself lives in the
 * existing campaign_performance / traffic_sources RPCs and is exercised against
 * the live DB; here we only pin the snake→camel reshape + numeric coercion.
 */

describe("campaign performance DTO", () => {
  it("maps a row to camelCase and coerces numeric-as-string to numbers", () => {
    const row: CampaignPerformanceRowLike = {
      campaign_id: "c-1",
      campaign_name: "Onam Scratch",
      campaign_status: "active",
      total_events: "120" as unknown as number, // RPCs can return numeric-as-string
      scans: 80,
      registrations: 40,
      scratches: 35,
      redemptions: 12,
      last_activity: "2026-07-18T10:00:00.000Z",
    };
    expect(toCampaignPerformanceDTO(row)).toEqual({
      campaignId: "c-1",
      campaignName: "Onam Scratch",
      status: "active",
      totalEvents: 120,
      scans: 80,
      registrations: 40,
      scratches: 35,
      redemptions: 12,
      lastActivity: "2026-07-18T10:00:00.000Z",
    });
  });

  it("preserves a null lastActivity and zero-normalizes missing counts", () => {
    const row: CampaignPerformanceRowLike = {
      campaign_id: "c-2",
      campaign_name: "Draft",
      campaign_status: "draft",
      total_events: null as unknown as number,
      scans: null as unknown as number,
      registrations: null as unknown as number,
      scratches: null as unknown as number,
      redemptions: null as unknown as number,
      last_activity: null,
    };
    const dto = toCampaignPerformanceDTO(row);
    expect(dto.totalEvents).toBe(0);
    expect(dto.scans).toBe(0);
    expect(dto.lastActivity).toBeNull();
  });
});

describe("daily activity DTO", () => {
  it("maps a row to camelCase and coerces counts to numbers", () => {
    const row: DailyActivityRowLike = {
      day: "2026-07-18",
      registrations: "12" as unknown as number,
      scratches: 8,
      coupons: 5,
      redemptions: 2,
    };
    expect(toDailyActivityDTO(row)).toEqual({
      day: "2026-07-18",
      registrations: 12,
      scratches: 8,
      coupons: 5,
      redemptions: 2,
    });
  });
});

describe("traffic source DTO", () => {
  it("maps a row to camelCase and coerces counts to numbers", () => {
    const row: TrafficSourceRowLike = {
      source: "instagram",
      qr_scans: "55" as unknown as number,
      registrations: 30,
      plays: 25,
      wins: 6,
      redemptions: 4,
    };
    expect(toTrafficSourceDTO(row)).toEqual({
      source: "instagram",
      qrScans: 55,
      registrations: 30,
      plays: 25,
      wins: 6,
      redemptions: 4,
    });
  });
});
