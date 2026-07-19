import "server-only";

import { syncPlayToWacrm, syncRedeemToWacrm, dispatchPendingWacrmCoupons } from "@/lib/wacrm/sync";
import type { ProviderAdapter } from "@/lib/communication/types";

export const wacrmAdapter: ProviderAdapter = {
  id: "wacrm",
  syncPlayResult: syncPlayToWacrm,
  syncRedeem: syncRedeemToWacrm,
  dispatchPendingCoupons: dispatchPendingWacrmCoupons,
};
