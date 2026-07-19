import { randomUUID } from "node:crypto";
import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import { isDeliverableUrl } from "@/lib/wacrm/webhooks/ssrf";
import type { ZapierEvent } from "@/lib/zapier/events";

export const DELIVERY_TIMEOUT_MS = 5000;
export const MAX_CONSECUTIVE_FAILURES = 15;

interface HookRow {
  id: string;
  hook_url: string;
}

export interface ZapierDeliveryPayload {
  id: string;
  event: ZapierEvent;
  occurred_at: string;
  business_id: string;
  data: unknown;
}

/**
 * Deliver an event to all active Zapier hook subscriptions for a business.
 * Best-effort; never throws.
 */
export async function deliverZapierHooks(
  businessId: string,
  event: ZapierEvent,
  data: unknown
): Promise<void> {
  try {
    const { data: rows, error } = await supabaseAdmin()
      .from("zapier_hook_subscriptions")
      .select("id, hook_url")
      .eq("business_id", businessId)
      .eq("event_name", event)
      .eq("is_active", true);

    if (error || !rows || rows.length === 0) return;

    const payload: ZapierDeliveryPayload = {
      id: randomUUID(),
      event,
      occurred_at: new Date().toISOString(),
      business_id: businessId,
      data,
    };
    await Promise.allSettled(
      (rows as HookRow[]).map((row) => deliverOne(row, payload))
    );
  } catch (err) {
    console.error("[zapier] deliver failed:", err);
  }
}

async function deliverOne(row: HookRow, payload: ZapierDeliveryPayload): Promise<void> {
  if (!(await isDeliverableUrl(row.hook_url))) {
    console.warn("[zapier] refusing non-public hook URL for", row.id);
    await recordFailure(row.id);
    return;
  }

  try {
    const url = new URL(row.hook_url);
    if (url.protocol !== "https:") {
      throw new Error("hook URL must be HTTPS");
    }

    const body = JSON.stringify(payload);
    const res = await fetch(row.hook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EngageOS-Event": payload.event,
        "X-EngageOS-Delivery-Id": payload.id,
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`hook responded ${res.status}`);

    await supabaseAdmin()
      .from("zapier_hook_subscriptions")
      .update({ failure_count: 0, last_delivery_at: new Date().toISOString() })
      .eq("id", row.id);
  } catch (err) {
    console.warn(
      `[zapier] delivery to ${row.id} failed:`,
      err instanceof Error ? err.message : err
    );
    await recordFailure(row.id);
  }
}

async function recordFailure(hookId: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("record_zapier_hook_failure", {
    p_hook_id: hookId,
    p_max_failures: MAX_CONSECUTIVE_FAILURES,
  });
  if (error) {
    console.error("[zapier] record_zapier_hook_failure failed for", hookId, error);
  }
}
