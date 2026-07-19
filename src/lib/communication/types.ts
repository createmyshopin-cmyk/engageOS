import type { PlayResult } from "@/lib/types";

export type WhatsAppProviderId = "wacrm" | "wati";

export interface PlaySyncParams {
  merchantSlug: string;
  campaignSlug: string;
  phone: string;
  name: string;
  result: PlayResult;
}

export interface RedeemSyncParams {
  businessId: string;
  phone: string;
  campaignId: string | null;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  error?: string;
}

export interface ProviderAdapter {
  readonly id: WhatsAppProviderId;
  syncPlayResult(params: PlaySyncParams): Promise<void>;
  syncRedeem(params: RedeemSyncParams): Promise<void>;
  dispatchPendingCoupons(
    businessId: string,
    limit?: number,
    campaignId?: string
  ): Promise<DispatchResult>;
}
