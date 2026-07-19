import "server-only";
import { WatiClient } from "@/lib/wati/client";
import { decryptSecret } from "@/lib/security/secrets";
import { getWatiIntegration } from "@/lib/wati/store";
import type { WatiIntegration } from "@/lib/wati/types";

/**
 * Tenant-aware facade over the WATI client — the single entry point the
 * rest of EngageOS uses. Resolves a tenant's integration row, decrypts the
 * token, and hands back a ready client. The UI never sees the token; WATI
 * is never called from the browser. Reuses the wacrm AES key (WACRM_ENCRYPTION_KEY).
 */

export interface TenantWati {
  client: WatiClient;
  integration: WatiIntegration;
}

/** WATI handle for a tenant, or null when not connected. Never throws on "not set up". */
export async function getWatiForBusiness(
  businessId: string
): Promise<TenantWati | null> {
  const integration = await getWatiIntegration(businessId);
  if (!integration || integration.status === "disconnected") return null;
  return {
    client: new WatiClient(integration.base_url, decryptSecret(integration.api_token_enc)),
    integration,
  };
}
