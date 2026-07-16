import "server-only";
import { adminClient } from "@/lib/db/rpc";
import type { WacrmIntegration } from "@/lib/wacrm/types";

/**
 * Integration-layer persistence for the wacrm bridge. Every helper is
 * explicitly scoped by business_id so nothing can cross a tenant boundary.
 * Kept OUT of TenantRepository on purpose: the core repository (auth /
 * tenant / business logic) stays unmodified per the V2.2 integration rules.
 */

export async function getIntegration(
  businessId: string
): Promise<WacrmIntegration | null> {
  const { data, error } = await adminClient()
    .from("business_integrations")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getIntegration failed: ${error.message}`);
  return (data as WacrmIntegration | null) ?? null;
}

export async function findIntegrationByAccountId(
  accountId: string
): Promise<WacrmIntegration | null> {
  const { data, error } = await adminClient()
    .from("business_integrations")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error(`findIntegrationByAccountId failed: ${error.message}`);
  return (data as WacrmIntegration | null) ?? null;
}

export async function upsertIntegration(
  businessId: string,
  row: Partial<WacrmIntegration>
): Promise<void> {
  const { error } = await adminClient()
    .from("business_integrations")
    .upsert(
      { ...row, business_id: businessId, updated_at: new Date().toISOString() },
      { onConflict: "business_id" }
    );
  if (error) throw new Error(`upsertIntegration failed: ${error.message}`);
}

export async function patchIntegration(
  businessId: string,
  patch: Partial<WacrmIntegration>
): Promise<void> {
  const { error } = await adminClient()
    .from("business_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) throw new Error(`patchIntegration failed: ${error.message}`);
}

export async function deleteIntegration(businessId: string): Promise<void> {
  const { error } = await adminClient()
    .from("business_integrations")
    .delete()
    .eq("business_id", businessId);
  if (error) throw new Error(`deleteIntegration failed: ${error.message}`);
}

// ---------- Message correlation (wamid → EngageOS entities) ----------

export async function recordMessageMap(row: {
  business_id: string;
  whatsapp_message_id: string;
  wacrm_message_id?: string | null;
  wacrm_conversation_id?: string | null;
  campaign_id?: string | null;
  customer_id?: string | null;
  coupon_id?: string | null;
  purpose: "coupon_delivery" | "inbox_reply" | "other";
}): Promise<void> {
  const { error } = await adminClient()
    .from("wa_message_map")
    .upsert(row, { onConflict: "whatsapp_message_id", ignoreDuplicates: true });
  if (error) throw new Error(`recordMessageMap failed: ${error.message}`);
}

export interface MessageMapRow {
  id: string;
  business_id: string;
  whatsapp_message_id: string;
  campaign_id: string | null;
  customer_id: string | null;
  coupon_id: string | null;
  purpose: string;
  status: string;
}

export async function findMessageByWamid(
  businessId: string,
  wamid: string
): Promise<MessageMapRow | null> {
  const { data, error } = await adminClient()
    .from("wa_message_map")
    .select("id, business_id, whatsapp_message_id, campaign_id, customer_id, coupon_id, purpose, status")
    .eq("business_id", businessId)
    .eq("whatsapp_message_id", wamid)
    .maybeSingle();
  if (error) throw new Error(`findMessageByWamid failed: ${error.message}`);
  return (data as MessageMapRow | null) ?? null;
}

export async function updateMessageStatus(
  businessId: string,
  wamid: string,
  status: "sent" | "delivered" | "read" | "failed"
): Promise<void> {
  const { error } = await adminClient()
    .from("wa_message_map")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("whatsapp_message_id", wamid);
  if (error) throw new Error(`updateMessageStatus failed: ${error.message}`);
}

// ---------- Broadcast ledger ----------

export interface BroadcastRow {
  id: string;
  business_id: string;
  wacrm_broadcast_id: string;
  name: string;
  template_name: string;
  template_language: string;
  segment: string;
  total_recipients: number;
  accepted: number;
  rejected: number;
  status: string;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
}

export async function insertBroadcast(
  row: Omit<BroadcastRow, "id" | "created_at" | "sent_count" | "delivered_count" | "read_count" | "failed_count"> & {
    created_by: string | null;
  }
): Promise<void> {
  const { error } = await adminClient().from("whatsapp_broadcasts").insert(row);
  if (error) throw new Error(`insertBroadcast failed: ${error.message}`);
}

export async function listBroadcasts(
  businessId: string,
  limit = 25
): Promise<BroadcastRow[]> {
  const { data, error } = await adminClient()
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listBroadcasts failed: ${error.message}`);
  return (data ?? []) as BroadcastRow[];
}

export async function updateBroadcastCounts(
  businessId: string,
  id: string,
  patch: Partial<Pick<BroadcastRow, "status" | "sent_count" | "delivered_count" | "read_count" | "failed_count">>
): Promise<void> {
  const { error } = await adminClient()
    .from("whatsapp_broadcasts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) throw new Error(`updateBroadcastCounts failed: ${error.message}`);
}

// ---------- Webhook idempotency ----------

/** True if this delivery id is new (and now claimed); false if already seen. */
export async function claimWebhookDelivery(
  deliveryId: string,
  businessId: string | null,
  event: string
): Promise<boolean> {
  const { error, count } = await adminClient()
    .from("wacrm_webhook_deliveries")
    .upsert(
      { id: deliveryId, business_id: businessId, event },
      { onConflict: "id", ignoreDuplicates: true, count: "exact" }
    );
  if (error) throw new Error(`claimWebhookDelivery failed: ${error.message}`);
  return (count ?? 0) > 0;
}

// ---------- Customer ↔ contact mapping ----------

export async function setCustomerContactId(
  businessId: string,
  customerId: string,
  wacrmContactId: string
): Promise<void> {
  const { error } = await adminClient()
    .from("customers")
    .update({ wacrm_contact_id: wacrmContactId })
    .eq("business_id", businessId)
    .eq("id", customerId);
  if (error) throw new Error(`setCustomerContactId failed: ${error.message}`);
}
