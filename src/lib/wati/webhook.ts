import "server-only";
import { adminClient as supabaseAdmin, recordCampaignEvent } from "@/lib/db/rpc";
import { getWatiIntegrationByWebhookToken, claimWatiWebhookDelivery } from "@/lib/wati/store";
import type { WatiIntegration } from "@/lib/wati/types";

/**
 * Inbound WATI webhook processing.
 *
 * This module is the ONLY thing that reacts to WATI's callbacks. It is
 * strictly additive to the outbound flow (src/lib/wati/sync.ts) — it never
 * sends a message, never rewrites the sender, and only ever WRITES delivery
 * receipts onto rows the outbound flow already created.
 *
 * Guarantees enforced here:
 *   • Tenant isolation — every payload is resolved to exactly one business
 *     via the UNIQUE webhook_token before any work happens.
 *   • Idempotency — each event is claimed in wati_webhook_deliveries first;
 *     WATI's up-to-144 retries collapse onto one claim.
 *   • No status regression — coupon delivery status only ever moves forward
 *     along pending → sent → delivered → read (failed is a terminal branch).
 *   • Never trust the payload — every field is coerced/validated; unknown
 *     event types are logged and ignored, never fatal.
 *   • Privacy — we log event lifecycle only, never tokens, secrets, phone
 *     numbers, or message text.
 */

/** WATI's documented event types. Anything else is ignored (not fatal). */
export type WatiEventType =
  | "messageReceived"
  | "sentMessage"
  | "sentMessageSENT"
  | "sentMessageDELIVERED"
  | "sentMessageREAD"
  | "templateMessageFailed"
  | "templateStatusUpdated";

/** Normalised, trusted view of an incoming payload (never the raw object). */
interface ParsedWatiEvent {
  eventType: string;
  statusString: string | null;
  localMessageId: string | null;
  whatsappMessageId: string | null;
  timestamp: string | null;
  failedCode: string | null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Defensive parse — arbitrary JSON in, a known shape (or null) out. */
export function parseWatiEvent(body: unknown): ParsedWatiEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const eventType = str(b.eventType);
  if (!eventType) return null;
  return {
    eventType,
    statusString: str(b.statusString),
    localMessageId: str(b.localMessageId),
    whatsappMessageId: str(b.whatsappMessageId),
    timestamp: str(b.timestamp),
    failedCode: str(b.failedCode),
  };
}

/**
 * Idempotency key. Prefer the WhatsApp message id (globally unique per
 * message); fall back to the local id. Combined with event type + status
 * so distinct status transitions on the SAME message are each processed
 * once, but a re-delivery of the identical transition is not.
 */
function dedupKey(ev: ParsedWatiEvent): string {
  const id = ev.whatsappMessageId || ev.localMessageId || ev.timestamp || "unknown";
  return `${ev.eventType}:${id}:${ev.statusString ?? ""}`;
}

/** The coupon delivery ladder. Higher index = later in the lifecycle. */
const COUPON_STATUS_LADDER = ["pending", "sent", "delivered", "read"] as const;
type CouponStatus = (typeof COUPON_STATUS_LADDER)[number] | "failed";

/**
 * Forward-only guard. A late/out-of-order receipt (e.g. a DELIVERED
 * arriving after READ) must never drag the status backwards. `failed`
 * may only be entered from pending/sent and is otherwise terminal.
 */
function isValidCouponTransition(current: string, incoming: CouponStatus): boolean {
  if (current === incoming) return false; // already there — no-op
  if (current === "read") return false; // read is the top rung
  if (current === "failed") return false; // failed is terminal
  if (incoming === "failed") return current === "pending" || current === "sent";
  const curIdx = COUPON_STATUS_LADDER.indexOf(current as (typeof COUPON_STATUS_LADDER)[number]);
  const incIdx = COUPON_STATUS_LADDER.indexOf(incoming as (typeof COUPON_STATUS_LADDER)[number]);
  if (curIdx === -1 || incIdx === -1) return false;
  return incIdx > curIdx;
}

/**
 * Recover the coupon code an outbound message referenced. The outbound
 * sender (sync.ts) sets broadcastName = `coupon_${code}`; WATI echoes an
 * identifier back on status callbacks as localMessageId. We strip the
 * known prefixes WATI may prepend and hand back the bare code, or null
 * when the id isn't a coupon message (e.g. participation / inbound).
 */
function extractCouponCode(localMessageId: string | null): string | null {
  if (!localMessageId) return null;
  const m = localMessageId.match(/coupon(?:_delivery)?_([A-Za-z0-9-]+)/);
  return m?.[1] ?? null;
}

/** Map a WATI event to our internal coupon status + campaign_events type. */
function mapEvent(ev: ParsedWatiEvent): {
  couponStatus: CouponStatus | null;
  eventType: string | null;
} {
  switch (ev.eventType) {
    case "sentMessage":
    case "sentMessageSENT":
      return { couponStatus: "sent", eventType: "whatsapp.sent" };
    case "sentMessageDELIVERED":
      return { couponStatus: "delivered", eventType: "whatsapp.delivered" };
    case "sentMessageREAD":
      return { couponStatus: "read", eventType: "whatsapp.read" };
    case "templateMessageFailed":
      return { couponStatus: "failed", eventType: "whatsapp.failed" };
    case "messageReceived":
      return { couponStatus: null, eventType: "whatsapp.received" };
    case "templateStatusUpdated":
      // Template approval state — not a per-message receipt. Logged only.
      return { couponStatus: null, eventType: null };
    default:
      return { couponStatus: null, eventType: null };
  }
}

interface CouponRow {
  id: string;
  campaign_id: string | null;
  wa_status: string;
}

/**
 * Apply a delivery-receipt status to the coupon the message referenced.
 * Scoped by business_id (tenant isolation) and guarded against regression.
 * Missing coupon / deleted campaign are non-events — we simply skip.
 */
async function applyCouponReceipt(
  integration: WatiIntegration,
  couponCode: string,
  status: CouponStatus,
  ev: ParsedWatiEvent
): Promise<{ updated: boolean; campaignId: string | null }> {
  const db = supabaseAdmin();
  const { data: coupon } = await db
    .from("coupons")
    .select("id, campaign_id, wa_status")
    .eq("business_id", integration.business_id)
    .eq("code", couponCode)
    .maybeSingle<CouponRow>();

  if (!coupon) return { updated: false, campaignId: null };
  if (!isValidCouponTransition(coupon.wa_status, status)) {
    return { updated: false, campaignId: coupon.campaign_id };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { wa_status: status };
  if (status === "sent") patch.wa_sent_at = nowIso;
  else if (status === "delivered") patch.wa_delivered_at = nowIso;
  else if (status === "read") patch.wa_read_at = nowIso;
  else if (status === "failed") {
    patch.wa_failed_at = nowIso;
    patch.wa_failed_reason = ev.failedCode ? `wati_${ev.failedCode}` : "wati_failed";
  }

  // Guard the write with the expected current status so two concurrent
  // receipts can't both win — the loser's WHERE matches zero rows.
  const { data: updated } = await db
    .from("coupons")
    .update(patch)
    .eq("business_id", integration.business_id)
    .eq("id", coupon.id)
    .eq("wa_status", coupon.wa_status)
    .select("id")
    .maybeSingle();

  return { updated: !!updated, campaignId: coupon.campaign_id };
}

/** Outcome of processing, for structured (privacy-safe) logging. */
export type WatiWebhookOutcome =
  | "processed"
  | "ignored"
  | "duplicate"
  | "unknown_tenant"
  | "malformed";

/**
 * Verify + resolve tenant. Returns the integration for a valid token, or
 * null (caller treats null as "unknown tenant / invalid verification").
 * Kept separate from processing so the route can ACK fast and defer work.
 */
export async function resolveWatiTenant(
  token: string | null
): Promise<WatiIntegration | null> {
  if (!token) return null;
  try {
    return await getWatiIntegrationByWebhookToken(token);
  } catch (err) {
    console.error("[wati-webhook] tenant resolve failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The heavy, async half — runs inside `after()` so the HTTP 200 is already
 * on the wire. `integration` is pre-resolved and trusted. Never throws to
 * the caller: every failure is caught and logged as a lifecycle line.
 */
export async function processWatiWebhook(
  integration: WatiIntegration,
  body: unknown
): Promise<WatiWebhookOutcome> {
  const ev = parseWatiEvent(body);
  if (!ev) {
    console.warn("[wati-webhook] malformed payload ignored");
    return "malformed";
  }

  try {
    // Idempotency: claim the event before doing anything with side effects.
    const claimed = await claimWatiWebhookDelivery({
      businessId: integration.business_id,
      dedupKey: dedupKey(ev),
      eventType: ev.eventType,
    });
    if (!claimed) {
      console.info(`[wati-webhook] duplicate ignored (${ev.eventType})`);
      return "duplicate";
    }

    const { couponStatus, eventType } = mapEvent(ev);

    // Unknown / non-actionable event (e.g. templateStatusUpdated): the claim
    // above already recorded that we saw it. Nothing else to do.
    if (!eventType) {
      console.info(`[wati-webhook] no-op event acknowledged (${ev.eventType})`);
      return "processed";
    }

    // Best-effort coupon receipt (only for outbound delivery events).
    let campaignId: string | null = null;
    if (couponStatus) {
      const couponCode = extractCouponCode(ev.localMessageId);
      if (couponCode) {
        const res = await applyCouponReceipt(integration, couponCode, couponStatus, ev);
        campaignId = res.campaignId;
      }
    }

    // Mirror into the immutable lifecycle log (analytics + dashboard read
    // from campaign_events; channel=wati keeps wacrm sends uncounted).
    await recordCampaignEvent({
      businessId: integration.business_id,
      campaignId,
      actorType: "system",
      actorId: null,
      eventType,
      metadata: {
        channel: "wati",
        source: "webhook",
        watiEvent: ev.eventType,
        status: ev.statusString ?? undefined,
        ...(ev.failedCode ? { failedCode: ev.failedCode } : {}),
      },
    });

    console.info(`[wati-webhook] processed ${ev.eventType} → ${eventType}`);
    return "processed";
  } catch (err) {
    console.error("[wati-webhook] processing failed:", err instanceof Error ? err.message : err);
    return "processed"; // already ACKed; swallow so nothing bubbles out of after()
  }
}
