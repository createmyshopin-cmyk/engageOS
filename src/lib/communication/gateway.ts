import "server-only";

import { wacrmAdapter } from "@/lib/communication/adapters/wacrm";
import { watiAdapter } from "@/lib/communication/adapters/wati";
import { getActiveWhatsAppProvider } from "@/lib/communication/provider";
import type {
  DispatchResult,
  PlaySyncParams,
  ProviderAdapter,
  RedeemSyncParams,
} from "@/lib/communication/types";

function resolveAdapter(provider: NonNullable<Awaited<ReturnType<typeof getActiveWhatsAppProvider>>>): ProviderAdapter {
  if (provider === "wacrm") return wacrmAdapter;
  return watiAdapter;
}

export async function syncPlayResult(params: PlaySyncParams): Promise<void> {
  const business = await loadBusinessIdBySlug(params.merchantSlug);
  if (!business) return;

  const provider = await getActiveWhatsAppProvider(business);
  if (!provider) return;

  await resolveAdapter(provider).syncPlayResult(params);
}

export async function syncRedeem(params: RedeemSyncParams): Promise<void> {
  const provider = await getActiveWhatsAppProvider(params.businessId);
  if (!provider) return;

  await resolveAdapter(provider).syncRedeem(params);
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

  return resolveAdapter(provider).dispatchPendingCoupons(businessId, limit, campaignId);
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
