import { isZapierEvent, type ZapierEvent } from "@/lib/zapier/events";
import { deliverZapierHooks } from "@/lib/zapier/deliver";

/**
 * Dispatch a campaign/commerce event to Zapier REST Hook subscribers.
 * Fire-and-forget — callers should not await in hot paths unless using after().
 */
export function dispatchZapierEvent(
  businessId: string,
  eventName: string,
  data: unknown
): void {
  if (!isZapierEvent(eventName)) return;
  void deliverZapierHooks(businessId, eventName as ZapierEvent, data);
}

/** Async variant for use inside after() blocks. */
export async function dispatchZapierEventAsync(
  businessId: string,
  eventName: string,
  data: unknown
): Promise<void> {
  if (!isZapierEvent(eventName)) return;
  await deliverZapierHooks(businessId, eventName as ZapierEvent, data);
}
