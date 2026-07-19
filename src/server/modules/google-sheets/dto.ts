import "server-only";

export interface SheetsCustomerExportDTO {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  joinedOn: string;
  latestCouponCode: string | null;
  latestPrize: string | null;
  totalRewards: number;
  tags?: string | null;
}

export interface SheetsCampaignPlayerExportDTO {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  joinedOn: string;
  campaignName: string;
  prizeName: string | null;
  code: string | null;
  couponStatus: string | null;
  playedAt: string;
}

export interface SheetsCampaignSummaryExportDTO {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  plays: number;
  wins: number;
  redeemed: number;
  remainingCoupons: number;
}

export interface SheetsCouponExportDTO {
  id: string;
  code: string;
  status: string;
  prizeName: string | null;
  campaignId: string;
  campaignName: string;
  customerName: string | null;
  customerPhone: string | null;
  shopifyLinked: boolean;
  shopifyCodeId: string | null;
  source: string;
  createdAt: string;
  redeemedAt: string | null;
  expiresAt: string | null;
}

export type SheetsExportRow =
  | SheetsCustomerExportDTO
  | SheetsCampaignPlayerExportDTO
  | SheetsCampaignSummaryExportDTO
  | SheetsCouponExportDTO;
