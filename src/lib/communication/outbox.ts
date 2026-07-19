import "server-only";

import { adminClient } from "@/lib/db/rpc";
import type { CommunicationEventType } from "@/lib/communication/events";
import { resolveCommunicationPriority } from "@/lib/communication/priority";

export interface CommunicationJobPayload {
  customerId?: string;
  phone?: string;
  customerName?: string;
  campaignId?: string | null;
  couponCode?: string;
  prizeName?: string;
  pointsDelta?: number;
  tierName?: string;
  orderTotal?: string;
  inactiveDays?: number;
  sourceEventId?: string;
  streamPayload?: Record<string, unknown>;
}

export interface CommunicationDispatchJob {
  id: string;
  business_id: string;
  event_type: CommunicationEventType | string;
  payload: CommunicationJobPayload;
  status: string;
  attempts: number;
  max_attempts: number;
  dedup_key: string | null;
  priority: number;
}

/** Append-only, idempotent enqueue for the communication outbox. */
export async function enqueueCommunicationJob(params: {
  businessId: string;
  eventType: CommunicationEventType | string;
  payload?: CommunicationJobPayload;
  dedupKey?: string | null;
  runAt?: Date;
  priority?: number;
}): Promise<string | null> {
  try {
    const { data, error } = await adminClient().rpc("communication_enqueue_job", {
      p_business_id: params.businessId,
      p_event_type: params.eventType,
      p_payload: params.payload ?? {},
      p_dedup_key: params.dedupKey ?? null,
      p_run_at: params.runAt?.toISOString() ?? null,
      p_priority: resolveCommunicationPriority(params.eventType, params.priority),
    });
    if (error) {
      console.error(`enqueueCommunicationJob(${params.eventType}) failed:`, error.message);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (err) {
    console.error(`enqueueCommunicationJob(${params.eventType}) threw:`, err);
    return null;
  }
}

export async function claimNextCommunicationJob(): Promise<CommunicationDispatchJob | null> {
  const { data, error } = await adminClient().rpc("communication_claim_next_job");
  if (error) {
    throw new Error(`communication_claim_next_job failed: ${error.message}`);
  }
  if (!data) return null;
  return data as CommunicationDispatchJob;
}

export async function finishCommunicationJob(
  jobId: string,
  success: boolean,
  errorMessage?: string | null,
  retryable = true
): Promise<void> {
  const { error } = await adminClient().rpc("communication_finish_job", {
    p_job_id: jobId,
    p_success: success,
    p_error: errorMessage ?? null,
    p_retryable: retryable,
  });
  if (error) {
    throw new Error(`communication_finish_job failed: ${error.message}`);
  }
}
