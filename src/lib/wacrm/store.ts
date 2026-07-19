import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import type { WacrmIntegration } from "@/lib/wacrm/types";

export async function getWacrmIntegration(
  businessId: string
): Promise<WacrmIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("business_integrations")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getWacrmIntegration failed: ${error.message}`);
  return (data as WacrmIntegration | null) ?? null;
}

export async function getWacrmIntegrationByAccountId(
  accountId: string
): Promise<WacrmIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("business_integrations")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    throw new Error(`getWacrmIntegrationByAccountId failed: ${error.message}`);
  }
  return (data as WacrmIntegration | null) ?? null;
}

export async function upsertWacrmIntegration(
  businessId: string,
  row: Partial<WacrmIntegration>
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("business_integrations")
    .upsert(
      {
        ...row,
        business_id: businessId,
        provider: "wacrm",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    );
  if (error) throw new Error(`upsertWacrmIntegration failed: ${error.message}`);
}

export async function patchWacrmIntegration(
  businessId: string,
  patch: Partial<WacrmIntegration>
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("business_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) throw new Error(`patchWacrmIntegration failed: ${error.message}`);
}

export async function deleteWacrmIntegration(businessId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("business_integrations")
    .delete()
    .eq("business_id", businessId);
  if (error) throw new Error(`deleteWacrmIntegration failed: ${error.message}`);
}

export async function isWacrmWebhookProcessed(deliveryId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("wacrm_webhook_deliveries")
    .select("id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) throw new Error(`isWacrmWebhookProcessed failed: ${error.message}`);
  return !!data;
}

/** Record a successfully processed webhook delivery (idempotent). */
export async function recordWacrmWebhookDelivery(params: {
  deliveryId: string;
  businessId: string;
  event: string;
}): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("wacrm_webhook_deliveries")
    .insert({
      id: params.deliveryId,
      business_id: params.businessId,
      event: params.event,
    });
  if (!error) return;
  if ((error as { code?: string }).code === "23505") return;
  throw new Error(`recordWacrmWebhookDelivery failed: ${error.message}`);
}

/** @deprecated Use isWacrmWebhookProcessed + recordWacrmWebhookDelivery */
export async function claimWacrmWebhookDelivery(params: {
  deliveryId: string;
  businessId: string;
  event: string;
}): Promise<boolean> {
  if (await isWacrmWebhookProcessed(params.deliveryId)) return false;
  return true;
}

export async function listWhatsappBroadcasts(
  businessId: string,
  limit = 25
): Promise<
  {
    id: string;
    wacrm_broadcast_id: string;
    name: string;
    template_name: string;
    status: string;
    total_recipients: number;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    failed_count: number;
    created_at: string;
  }[]
> {
  const { data, error } = await supabaseAdmin()
    .from("whatsapp_broadcasts")
    .select(
      "id, wacrm_broadcast_id, name, template_name, status, total_recipients, sent_count, delivered_count, read_count, failed_count, created_at"
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listWhatsappBroadcasts failed: ${error.message}`);
  return data ?? [];
}

export async function insertWhatsappBroadcast(
  businessId: string,
  row: {
    wacrm_broadcast_id: string;
    name: string;
    template_name: string;
    template_language: string;
    segment: string;
    total_recipients: number;
    accepted: number;
    rejected: number;
    status: string;
    created_by?: string | null;
  }
): Promise<void> {
  const { error } = await supabaseAdmin().from("whatsapp_broadcasts").insert({
    business_id: businessId,
    ...row,
  });
  if (error) throw new Error(`insertWhatsappBroadcast failed: ${error.message}`);
}
