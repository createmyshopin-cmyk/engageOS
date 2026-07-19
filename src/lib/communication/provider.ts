import "server-only";

import { getWacrmIntegration } from "@/lib/wacrm/store";
import { getWatiIntegration } from "@/lib/wati/store";
import type { WhatsAppProviderId } from "@/lib/communication/types";

export type { WhatsAppProviderId as WhatsAppProvider };

/** Returns the active WhatsApp provider for a tenant, if any. */
export async function getActiveWhatsAppProvider(
  businessId: string
): Promise<WhatsAppProviderId | null> {
  const wacrm = await getWacrmIntegration(businessId);
  if (wacrm && wacrm.status !== "disconnected") return "wacrm";

  const wati = await getWatiIntegration(businessId);
  if (wati && wati.status !== "disconnected") return "wati";

  return null;
}

export async function assertWhatsAppProviderAvailable(
  businessId: string,
  requested: WhatsAppProviderId
): Promise<{ ok: true } | { ok: false; active: WhatsAppProviderId }> {
  const active = await getActiveWhatsAppProvider(businessId);
  if (!active || active === requested) return { ok: true };
  return { ok: false, active };
}
