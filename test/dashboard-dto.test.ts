import { describe, it, expect } from "vitest";
import { toAnalyticsOverviewDTO } from "@/server/modules/analytics/dto";
import { toCampaignListItemDTO, type CampaignRow, type CampaignStats } from "@/server/modules/campaigns/dto";

/**
 * Phase 1 (Dashboard Home) — pure transformer logic for the two new v1
 * endpoints. These encode the only app-tier rules in the module (win-rate
 * derivation, zero-normalization, snake→camel mapping); the aggregation itself
 * lives in SQL and is exercised against the live DB, not here.
 */

describe("analytics overview DTO", () => {
  it("maps event totals to the KPI snapshot and coerces to numbers", () => {
    const dto = toAnalyticsOverviewDTO({
      customers: "12" as unknown as number, // RPCs can return numeric-as-string
      plays: 40,
      wins: 9,
      losses: 31,
      coupons: 9,
      redeemed: 5,
      return_visits: 3,
    });
    expect(dto).toEqual({
      customers: 12,
      plays: 40,
      wins: 9,
      losses: 31,
      coupons: 9,
      redeemed: 5,
      returnVisits: 3,
    });
  });

  it("normalizes missing/NaN fields to zero", () => {
    const dto = toAnalyticsOverviewDTO({} as never);
    expect(dto).toEqual({
      customers: 0,
      plays: 0,
      wins: 0,
      losses: 0,
      coupons: 0,
      redeemed: 0,
      returnVisits: 0,
    });
  });
});

describe("campaign list item DTO", () => {
  const row: CampaignRow = {
    id: "c1",
    name: "Onam Bonanza",
    slug: "onam-bonanza",
    status: "active",
    starts_at: "2026-07-01T00:00:00Z",
    ends_at: "2026-07-31T00:00:00Z",
    headline: "Win big",
    banner_url: "https://x/b.png",
    logo_url: null,
    created_at: "2026-06-20T10:00:00Z",
  };

  it("maps snake_case columns to the camelCase wire shape", () => {
    const dto = toCampaignListItemDTO(row, undefined);
    expect(dto.startsAt).toBe(row.starts_at);
    expect(dto.endsAt).toBe(row.ends_at);
    expect(dto.bannerUrl).toBe(row.banner_url);
    expect(dto.logoUrl).toBeNull();
    expect(dto.createdAt).toBe(row.created_at);
  });

  it("derives win rate as round(wins/plays*100)", () => {
    const stats: CampaignStats = {
      plays: 40,
      wins: 9,
      redeemed: 5,
      wa_sent: 12,
      wa_failed: 1,
      remaining_coupons: 88,
    };
    const dto = toCampaignListItemDTO(row, stats);
    expect(dto.stats.winRate).toBe(23); // round(9/40*100) = 22.5 → 23
    expect(dto.stats.waSent).toBe(12);
    expect(dto.stats.remainingCoupons).toBe(88);
  });

  it("uses zeroed stats and 0% win rate when a campaign has no rollup row", () => {
    const dto = toCampaignListItemDTO(row, undefined);
    expect(dto.stats).toEqual({
      plays: 0,
      wins: 0,
      redeemed: 0,
      waSent: 0,
      remainingCoupons: 0,
      winRate: 0,
    });
  });

  it("never divides by zero (0 plays → 0% win rate)", () => {
    const stats: CampaignStats = {
      plays: 0,
      wins: 0,
      redeemed: 0,
      wa_sent: 0,
      wa_failed: 0,
      remaining_coupons: 100,
    };
    const dto = toCampaignListItemDTO(row, stats);
    expect(dto.stats.winRate).toBe(0);
  });
});
