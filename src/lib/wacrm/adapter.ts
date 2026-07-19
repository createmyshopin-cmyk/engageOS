import "server-only";

import { decryptSecret } from "@/lib/wacrm/crypto";
import { WacrmClient } from "@/lib/wacrm/client";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import type { WacrmIntegration } from "@/lib/wacrm/types";

export interface TenantWacrm {
  integration: WacrmIntegration;
  client: WacrmClient;
}

export async function getWacrmForBusiness(
  businessId: string
): Promise<TenantWacrm | null> {
  const integration = await getWacrmIntegration(businessId);
  if (!integration || integration.status === "disconnected") return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(integration.api_key_enc);
  } catch (err) {
    console.error("WACRM API key decrypt failed:", err);
    return null;
  }

  const client = new WacrmClient(integration.base_url, apiKey);
  return { integration, client };
}
