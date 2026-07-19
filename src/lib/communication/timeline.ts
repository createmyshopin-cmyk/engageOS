import "server-only";

import { adminClient } from "@/lib/db/rpc";

/** Record a WhatsApp / communication event on the universal customer timeline. */
export async function recordCommunicationTimelineEvent(params: {
  businessId: string;
  customerId: string | null;
  campaignId?: string | null;
  eventName: string;
  payload?: Record<string, unknown>;
  dedupKey?: string | null;
}): Promise<void> {
  if (!params.customerId) return;

  try {
    const { error } = await adminClient().rpc("record_event", {
      p_business_id: params.businessId,
      p_event_name: params.eventName,
      p_category: "communication",
      p_customer_id: params.customerId,
      p_campaign_id: params.campaignId ?? null,
      p_source: "communication_gateway",
      p_payload: params.payload ?? {},
      p_dedup_key: params.dedupKey ?? null,
      p_occurred_at: null,
    });
    if (error) {
      console.error(`recordCommunicationTimelineEvent(${params.eventName}) failed:`, error.message);
    }
  } catch (err) {
    console.error(`recordCommunicationTimelineEvent(${params.eventName}) threw:`, err);
  }
}
