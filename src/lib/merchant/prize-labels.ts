import type { PrizeType } from "@/lib/types";

export const PRIZE_TYPE_LABELS: Record<PrizeType, string> = {
  coupon: "Coupon",
  physical_gift: "Physical Gift",
  gift_voucher: "Gift Voucher",
  lucky_draw: "Lucky Draw",
  cashback: "Cashback",
  wallet_points: "Wallet Points",
};

export function prizeTypeLabel(type: PrizeType | string | null | undefined): string {
  if (!type) return "Prize";
  return PRIZE_TYPE_LABELS[type as PrizeType] ?? type;
}
