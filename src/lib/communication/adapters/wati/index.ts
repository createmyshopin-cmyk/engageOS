import "server-only";

import {
  syncPlayToWati,
  dispatchPendingWatiCoupons,
} from "@/lib/wati/sync";
import type { ProviderAdapter } from "@/lib/communication/types";

export const watiAdapter: ProviderAdapter = {
  id: "wati",
  syncPlayResult: syncPlayToWati,
  syncRedeem: async () => {
    /* WATI has no contact tag sync on redeem */
  },
  dispatchPendingCoupons: dispatchPendingWatiCoupons,
};
