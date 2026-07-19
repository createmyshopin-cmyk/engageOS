import "server-only";

import { adminClient as supabaseAdmin, recordCampaignEvent } from "@/lib/db/rpc";
import { decryptSecret } from "@/lib/wacrm/crypto";
import { getWacrmIntegrationByAccountId, isWacrmWebhookProcessed, recordWacrmWebhookDelivery } from "@/lib/wacrm/store";
import type { WacrmIntegration } from "@/lib/wacrm/types";
import { recordCommunicationTimelineEvent } from "@/lib/communication/timeline";
import { resolveCustomerFromWacrmContact } from "@/lib/wacrm/contact-link";

const COUPON_STATUS_LADDER = ["pending", "sent", "delivered", "read"] as const;
type CouponStatus = (typeof COUPON_STATUS_LADDER)[number] | "failed";

function isValidCouponTransition(current: string, incoming: CouponStatus): boolean {
  if (current === incoming) return false;
  if (current === "read") return false;
  if (current === "failed") return false;
  if (incoming === "failed") return current === "pending" || current === "sent";
  const curIdx = COUPON_STATUS_LADDER.indexOf(current as (typeof COUPON_STATUS_LADDER)[number]);
  const incIdx = COUPON_STATUS_LADDER.indexOf(incoming as (typeof COUPON_STATUS_LADDER)[number]);
  if (curIdx === -1 || incIdx === -1) return false;
  return incIdx > curIdx;
}

function mapDeliveryStatus(status: string): CouponStatus | null {
  const normalized = status.toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "delivered") return "delivered";
  if (normalized === "read") return "read";
  if (normalized === "failed") return "failed";
  return null;
}

interface WacrmWebhookEnvelope {
  id: string;
  event: string;
  occurred_at: string;
  account_id: string;
  data: Record<string, unknown>;
}

export async function processWacrmWebhook(
  integration: WacrmIntegration,
  envelope: WacrmWebhookEnvelope
): Promise<void> {
  if (await isWacrmWebhookProcessed(envelope.id)) return;

  if (envelope.event === "message.status_updated") {
    await handleStatusUpdated(integration, envelope);
  } else if (envelope.event === "message.received") {
    await handleMessageReceived(integration, envelope);
  } else if (envelope.event === "conversation.created") {
    await handleConversationCreated(integration, envelope);
  }

  await recordWacrmWebhookDelivery({
    deliveryId: envelope.id,
    businessId: integration.business_id,
    event: envelope.event,
  });
}

async function handleStatusUpdated(
  integration: WacrmIntegration,
  envelope: WacrmWebhookEnvelope
): Promise<void> {
  const wamid = typeof envelope.data.whatsapp_message_id === "string"
    ? envelope.data.whatsapp_message_id
    : null;
  const statusRaw = typeof envelope.data.status === "string" ? envelope.data.status : null;
  if (!wamid || !statusRaw) return;

  const mapped = mapDeliveryStatus(statusRaw);
  if (!mapped) return;

  const { data: row } = await supabaseAdmin()
    .from("wa_message_map")
    .select("id, business_id, campaign_id, coupon_id, customer_id, status")
    .eq("whatsapp_message_id", wamid)
    .maybeSingle<{
      id: string;
      business_id: string;
      campaign_id: string | null;
      coupon_id: string | null;
      customer_id: string | null;
      status: string;
    }>();

  if (!row || row.business_id !== integration.business_id) return;

  if (!isValidCouponTransition(row.status, mapped)) return;

  const { error: mapErr } = await supabaseAdmin()
    .from("wa_message_map")
    .update({ status: mapped, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", row.status);
  if (mapErr) {
    console.error("wa_message_map status update failed:", mapErr.message);
    return;
  }

  const eventType =
    mapped === "delivered"
      ? "whatsapp.delivered"
      : mapped === "read"
        ? "whatsapp.read"
        : mapped === "failed"
          ? "whatsapp.failed"
          : null;

  if (eventType) {
    const meta = { wamid, channel: "wacrm", source: "webhook" };
    await recordCampaignEvent({
      businessId: integration.business_id,
      campaignId: row.campaign_id,
      eventType,
      actorType: "system",
      actorId: null,
      metadata: meta,
    });

    await recordCommunicationTimelineEvent({
      businessId: integration.business_id,
      customerId: row.customer_id,
      campaignId: row.campaign_id,
      eventName: eventType,
      payload: meta,
      dedupKey: `wacrm:status:${envelope.id}`,
    });
  }

  if (row.coupon_id && (mapped === "failed" || mapped === "delivered" || mapped === "read")) {
    const couponStatus = mapped === "failed" ? "failed" : mapped;
    const { data: coupon } = await supabaseAdmin()
      .from("coupons")
      .select("wa_status")
      .eq("id", row.coupon_id)
      .maybeSingle<{ wa_status: string }>();

    if (coupon && isValidCouponTransition(coupon.wa_status, couponStatus)) {
      await supabaseAdmin()
        .from("coupons")
        .update({ wa_status: couponStatus })
        .eq("id", row.coupon_id);
    }
  }
}

async function handleMessageReceived(
  integration: WacrmIntegration,
  envelope: WacrmWebhookEnvelope
): Promise<void> {
  const conversationId =
    typeof envelope.data.conversation_id === "string"
      ? envelope.data.conversation_id
      : null;
  const wamid =
    typeof envelope.data.whatsapp_message_id === "string"
      ? envelope.data.whatsapp_message_id
      : null;
  const contactId =
    typeof envelope.data.contact_id === "string" ? envelope.data.contact_id : null;
  const text = typeof envelope.data.text === "string" ? envelope.data.text : null;

  let customerId: string | null = null;
  if (contactId) {
    const resolved = await resolveCustomerFromWacrmContact(
      integration.business_id,
      contactId
    );
    customerId = resolved.customerId;
  }

  await supabaseAdmin().rpc("record_event", {
    p_business_id: integration.business_id,
    p_event_name: "whatsapp.received",
    p_category: "communication",
    p_customer_id: customerId,
    p_campaign_id: null,
    p_source: "wacrm",
    p_payload: { conversationId, wamid, contactId, text, channel: "wacrm" },
    p_dedup_key: `wacrm:received:${envelope.id}`,
    p_occurred_at: envelope.occurred_at ?? null,
  });
}

async function handleConversationCreated(
  integration: WacrmIntegration,
  envelope: WacrmWebhookEnvelope
): Promise<void> {
  const contactId =
    typeof envelope.data.contact_id === "string" ? envelope.data.contact_id : null;
  const conversationId =
    typeof envelope.data.conversation_id === "string"
      ? envelope.data.conversation_id
      : null;
  if (!contactId) return;

  const { customerId } = await resolveCustomerFromWacrmContact(
    integration.business_id,
    contactId
  );

  await recordCommunicationTimelineEvent({
    businessId: integration.business_id,
    customerId,
    campaignId: null,
    eventName: "whatsapp.conversation.created",
    payload: { conversationId, contactId, channel: "wacrm" },
    dedupKey: `wacrm:conversation:${envelope.id}`,
  });
}

export async function resolveWacrmIntegrationForWebhook(
  accountId: string
): Promise<WacrmIntegration | null> {
  return getWacrmIntegrationByAccountId(accountId);
}

export function getWebhookSecret(integration: WacrmIntegration): string | null {
  if (!integration.webhook_secret_enc) return null;
  try {
    return decryptSecret(integration.webhook_secret_enc);
  } catch {
    return null;
  }
}
