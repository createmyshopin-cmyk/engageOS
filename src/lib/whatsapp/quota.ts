import "server-only";

import { adminClient } from "@/lib/db/rpc";

export class WaQuotaExhaustedError extends Error {
  constructor() {
    super("WhatsApp message quota exhausted");
    this.name = "WaQuotaExhaustedError";
  }
}

/** Atomically reserve outbound WA quota. Throws when exhausted. */
export async function reserveWaQuota(businessId: string, count = 1): Promise<void> {
  const { data, error } = await adminClient().rpc("try_reserve_wa_quota", {
    p_business_id: businessId,
    p_count: count,
  });
  if (error) {
    throw new Error(`try_reserve_wa_quota failed: ${error.message}`);
  }
  if (!data) {
    throw new WaQuotaExhaustedError();
  }
}
