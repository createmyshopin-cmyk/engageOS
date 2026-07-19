import { describe, it, expect } from "vitest";
import {
  toWinnerListItemDTO,
  toWinnersSummaryDTO,
  emptyWinnersSummaryDTO,
} from "@/server/modules/winners/dto";
import { dateRangeToTimestamps } from "@/server/modules/winners/validator";
import {
  addIstDays,
  istDateRangeToTimestamps,
  todayIstDate,
  yesterdayIstDate,
} from "@/lib/merchant/ist-date";
import { wonDateToApi } from "@/components/merchant/winners/winners-date-filter";

describe("winners IST date helpers", () => {
  it("maps a calendar day to IST offset timestamps", () => {
    expect(istDateRangeToTimestamps("2026-07-19", "2026-07-19")).toEqual({
      from: "2026-07-19T00:00:00.000+05:30",
      to: "2026-07-19T23:59:59.999+05:30",
    });
  });

  it("today and yesterday presets produce single-day ranges", () => {
    const today = todayIstDate();
    const yesterday = yesterdayIstDate();
    expect(yesterday).toBe(addIstDays(today, -1));

    expect(wonDateToApi({ preset: "today", from: "", to: "" })).toEqual({
      wonFrom: today,
      wonTo: today,
    });
    expect(wonDateToApi({ preset: "yesterday", from: "", to: "" })).toEqual({
      wonFrom: yesterday,
      wonTo: yesterday,
    });
  });

  it("validator dateRangeToTimestamps delegates to IST bounds", () => {
    expect(dateRangeToTimestamps("2026-07-19", null)).toEqual({
      from: "2026-07-19T00:00:00.000+05:30",
      to: null,
    });
  });
});

describe("winners DTO", () => {
  it("maps summary row including today/yesterday counts", () => {
    const dto = toWinnersSummaryDTO({
      total_winners: "75",
      coupons_won: "69",
      gifts_won: "6",
      ongoing_campaigns: "3",
      prizes_in_period: "75",
      mom_growth_pct: "100",
      winners_today: "2",
      winners_yesterday: "4",
    });
    expect(dto.totalWinners).toBe(75);
    expect(dto.winnersToday).toBe(2);
    expect(dto.winnersYesterday).toBe(4);
    expect(dto.couponsPct).toBe(92);
    expect(dto.giftsPct).toBe(8);
  });

  it("maps list row to camelCase DTO", () => {
    const dto = toWinnerListItemDTO({
      event_id: "e1",
      customer_id: "c1",
      customer_name: "Test",
      customer_phone: "+919999999999",
      campaign_id: "camp1",
      campaign_name: "Campaign",
      campaign_type: "scratch_win",
      prize_name: "10% OFF",
      prize_type: "coupon",
      prize_value: 10,
      coupon_code: "ABC123",
      won_at: "2026-07-19T10:00:00Z",
      wa_opt_out: false,
      total_count: 2,
    });
    expect(dto.eventId).toBe("e1");
    expect(dto.customerId).toBe("c1");
    expect(dto.campaignType).toBe("scratch_win");
    expect(dto.waOptOut).toBe(false);
  });

  it("empty summary defaults to zeros", () => {
    const dto = emptyWinnersSummaryDTO();
    expect(dto.winnersToday).toBe(0);
    expect(dto.winnersYesterday).toBe(0);
  });
});
