import "server-only";

import type { PlayResult } from "@/lib/types";
import {
  dispatchPendingWatiCoupons,
  syncPlayToWati,
} from "@/lib/wati/sync";
import { getActiveWhatsAppProvider } from "@/lib/whatsapp/provider";

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
  couponCode?: string;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  error?: string;
}

export async function syncPlayResult(params: PlaySyncParams): Promise<void> {
  const businessId = await loadBusinessIdBySlug(params.merchantSlug);
  if (!businessId) return;

  const provider = await getActiveWhatsAppProvider(businessId);
  if (provider !== "wati") return;

  await syncPlayToWati({
    merchantSlug: params.merchantSlug,
    campaignSlug: params.campaignSlug,
    phone: params.phone,
    name: params.name,
    result: params.result,
  });
}

export async function syncRedeem(_params: RedeemSyncParams): Promise<void> {
  // WATI has no redeem-side contact sync.
}

export async function dispatchPendingCoupons(
  businessId: string,
  limit = 50,
  campaignId?: string
): Promise<DispatchResult> {
  const provider = await getActiveWhatsAppProvider(businessId);
  if (!provider) {
    return { sent: 0, failed: 0, error: "No WhatsApp provider connected" };
  }

  return dispatchPendingWatiCoupons(businessId, limit, campaignId);
}

async function loadBusinessIdBySlug(slug: string): Promise<string | null> {
  const { adminClient } = await import("@/lib/db/rpc");
  const { data } = await adminClient()
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
