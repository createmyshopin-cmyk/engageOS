import "server-only";

import { adminClient } from "@/lib/db/rpc";

export class WaQuotaExhaustedError extends Error {
  constructor() {
    super("WhatsApp message quota exhausted");
    this.name = "WaQuotaExhaustedError";
  }
}

/** Atomically reserve outbound WA quota. Throws when exhausted. */
export async function reserveWaQuota(
  businessId: string,
  count = 1
): Promise<void> {
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

export async function getWaQuotaSnapshot(businessId: string): Promise<{
  sent: number;
  limit: number;
  remaining: number;
}> {
  const { data, error } = await adminClient()
    .from("businesses")
    .select("wa_messages_sent, wa_messages_quota")
    .eq("id", businessId)
    .maybeSingle<{ wa_messages_sent: number; wa_messages_quota: number }>();

  if (error || !data) {
    return { sent: 0, limit: 0, remaining: 0 };
  }

  const sent = Number(data.wa_messages_sent) || 0;
  const limit = Number(data.wa_messages_quota) || 0;
  return { sent, limit, remaining: Math.max(0, limit - sent) };
}
