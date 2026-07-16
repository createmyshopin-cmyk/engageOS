import { NextRequest, NextResponse } from "next/server";
import { adminClient, recordCampaignEvent } from "@/lib/db/rpc";
import { decryptSecret, verifyWacrmSignature } from "@/lib/wacrm/crypto";
import {
  claimWebhookDelivery,
  findIntegrationByAccountId,
  findMessageByWamid,
  updateMessageStatus,
} from "@/lib/wacrm/store";
import type { WacrmWebhookEvent } from "@/lib/wacrm/types";

export const runtime = "nodejs";

/**
 * Inbound webhook from wacrm (registered per tenant at connect time).
 * Closes the delivery loop: wacrm's Meta status callbacks land here and are
 * written back into the immutable campaign_events log + coupon wa_status,
 * so EngageOS analytics show REAL delivered/read/failed numbers.
 *
 * Security: HMAC-SHA256 signature over the raw body with the per-tenant
 * webhook secret (constant-time compare + 5-minute replay window), tenant
 * resolved by the payload's wacrm account_id, and idempotency via the
 * per-delivery id (providers re-send and re-order callbacks).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  let event: WacrmWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!event?.id || !event.event || !event.account_id) {
    return NextResponse.json({ ok: false, error: "Malformed event" }, { status: 400 });
  }

  const integration = await findIntegrationByAccountId(event.account_id);
  if (!integration || !integration.webhook_secret_enc) {
    // Unknown tenant — acknowledge so wacrm doesn't disable the endpoint,
    // but do nothing.
    return NextResponse.json({ ok: true });
  }

  const signatureOk = verifyWacrmSignature(
    req.headers.get("x-wacrm-signature"),
    rawBody,
    decryptSecret(integration.webhook_secret_enc)
  );
  if (!signatureOk) {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 401 });
  }

  // Idempotency: the same delivery may arrive more than once.
  const fresh = await claimWebhookDelivery(event.id, integration.business_id, event.event);
  if (!fresh) return NextResponse.json({ ok: true, deduped: true });

  try {
    if (event.event === "message.status_updated") {
      await handleStatusUpdate(integration.business_id, event.data);
    }
    // message.received / conversation.created need no local state: the
    // Inbox tab reads conversations live from wacrm (never duplicated).
  } catch (err) {
    console.error("wacrm webhook processing failed:", err);
  }

  return NextResponse.json({ ok: true });
}

const STATUS_EVENT: Record<string, "whatsapp.delivered" | "whatsapp.read" | "whatsapp.failed"> = {
  delivered: "whatsapp.delivered",
  read: "whatsapp.read",
  failed: "whatsapp.failed",
};

async function handleStatusUpdate(
  businessId: string,
  data: Record<string, unknown>
): Promise<void> {
  const wamid = typeof data.whatsapp_message_id === "string" ? data.whatsapp_message_id : null;
  const status = typeof data.status === "string" ? data.status : null;
  if (!wamid || !status) return;

  const mapped = await findMessageByWamid(businessId, wamid);
  if (!mapped) return; // a message EngageOS didn't send (e.g. sent from wacrm's own inbox)

  // Statuses can arrive out of order — never downgrade read → delivered.
  const rank: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };
  if ((rank[status] ?? -1) > (rank[mapped.status] ?? -1)) {
    await updateMessageStatus(businessId, wamid, status as "delivered" | "read" | "failed");
  }

  if (status === "failed" && mapped.coupon_id) {
    await adminClient()
      .from("coupons")
      .update({ wa_status: "failed" })
      .eq("business_id", businessId)
      .eq("id", mapped.coupon_id);
  }

  const eventType = STATUS_EVENT[status];
  if (eventType) {
    await recordCampaignEvent({
      businessId,
      campaignId: mapped.campaign_id,
      actorType: "system",
      actorId: null,
      eventType,
      metadata: { wamid, purpose: mapped.purpose, channel: "wacrm" },
    });
  }
}
