import type { CampaignType, PrizeType } from "@/lib/types";

export interface WinnerListItemDTO {
  eventId: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignType: CampaignType | null;
  prizeName: string | null;
  prizeType: PrizeType | null;
  prizeValue: number | null;
  couponCode: string | null;
  wonAt: string;
  waOptOut: boolean;
}

export interface WinnersSummaryDTO {
  totalWinners: number;
  couponsWon: number;
  giftsWon: number;
  ongoingCampaigns: number;
  prizesInPeriod: number;
  momGrowthPct: number;
  couponsPct: number;
  giftsPct: number;
  winnersToday: number;
  winnersYesterday: number;
}

export interface WinnerListRow {
  event_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_type: string | null;
  prize_name: string | null;
  prize_type: string | null;
  prize_value: number | string | null;
  coupon_code: string | null;
  won_at: string;
  wa_opt_out: boolean | null;
  total_count: number | string;
}

export interface WinnersSummaryRow {
  total_winners: number | string | null;
  coupons_won: number | string | null;
  gifts_won: number | string | null;
  ongoing_campaigns: number | string | null;
  prizes_in_period: number | string | null;
  mom_growth_pct: number | string | null;
  winners_today: number | string | null;
  winners_yesterday: number | string | null;
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function toWinnerListItemDTO(row: WinnerListRow): WinnerListItemDTO {
  return {
    eventId: row.event_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignType: (row.campaign_type as CampaignType | null) ?? null,
    prizeName: row.prize_name,
    prizeType: (row.prize_type as PrizeType | null) ?? null,
    prizeValue: row.prize_value != null ? num(row.prize_value) : null,
    couponCode: row.coupon_code,
    wonAt: row.won_at,
    waOptOut: row.wa_opt_out ?? false,
  };
}

export function toWinnersSummaryDTO(row: WinnersSummaryRow | null): WinnersSummaryDTO {
  const total = num(row?.total_winners);
  const coupons = num(row?.coupons_won);
  const gifts = num(row?.gifts_won);
  return {
    totalWinners: total,
    couponsWon: coupons,
    giftsWon: gifts,
    ongoingCampaigns: num(row?.ongoing_campaigns),
    prizesInPeriod: num(row?.prizes_in_period),
    momGrowthPct: num(row?.mom_growth_pct),
    couponsPct: total > 0 ? Math.round((coupons / total) * 100) : 0,
    giftsPct: total > 0 ? Math.round((gifts / total) * 100) : 0,
    winnersToday: num(row?.winners_today),
    winnersYesterday: num(row?.winners_yesterday),
  };
}

export function emptyWinnersSummaryDTO(): WinnersSummaryDTO {
  return {
    totalWinners: 0,
    couponsWon: 0,
    giftsWon: 0,
    ongoingCampaigns: 0,
    prizesInPeriod: 0,
    momGrowthPct: 0,
    couponsPct: 0,
    giftsPct: 0,
    winnersToday: 0,
    winnersYesterday: 0,
  };
}
