import "server-only";

import { getWatiIntegration } from "@/lib/wati/store";

export type WhatsAppProvider = "wati";

export async function getActiveWhatsAppProvider(
  businessId: string
): Promise<WhatsAppProvider | null> {
  const wati = await getWatiIntegration(businessId);
  if (wati && wati.status !== "disconnected") return "wati";
  return null;
}

export async function assertWhatsAppProviderAvailable(
  businessId: string,
  requested: WhatsAppProvider
): Promise<{ ok: true } | { ok: false; active: WhatsAppProvider }> {
  const active = await getActiveWhatsAppProvider(businessId);
  if (!active || active === requested) return { ok: true };
  return { ok: false, active };
}
