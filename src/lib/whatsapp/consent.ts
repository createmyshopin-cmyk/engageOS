import "server-only";

import { adminClient } from "@/lib/db/rpc";

const STOP_WORDS = new Set(["stop", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "subscribe"]);

export function consentCommand(text: string): "revoke" | "grant" | null {
  const normalized = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (STOP_WORDS.has(normalized)) return "revoke";
  if (START_WORDS.has(normalized)) return "grant";
  return null;
}

export function shouldSuppressWhatsAppSend(customer: {
  wa_opt_out?: boolean | null;
} | null): boolean {
  return customer?.wa_opt_out === true;
}

export async function setWhatsAppConsentByPhone(params: {
  businessId: string;
  phone: string;
  granted: boolean;
  source: string;
  campaignSlug?: string;
  disclosureText?: string;
  evidence?: Record<string, unknown>;
}): Promise<boolean> {
  const db = adminClient();
  const { data: customer, error } = await db
    .from("customers")
    .select("id")
    .eq("business_id", params.businessId)
    .eq("phone", params.phone)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error(`Consent customer lookup failed: ${error.message}`);
  if (!customer) return false;

  let campaignId: string | null = null;
  if (params.campaignSlug) {
    const { data: campaign, error: campaignError } = await db
      .from("campaigns")
      .select("id")
      .eq("business_id", params.businessId)
      .eq("slug", params.campaignSlug)
      .maybeSingle<{ id: string }>();
    if (campaignError) throw new Error(`Consent campaign lookup failed: ${campaignError.message}`);
    campaignId = campaign?.id ?? null;
  }

  const { error: consentError } = await db.rpc("record_whatsapp_consent", {
    p_business_id: params.businessId,
    p_customer_id: customer.id,
    p_status: params.granted ? "granted" : "revoked",
    p_source: params.source,
    p_campaign_id: campaignId,
    p_disclosure_text: params.disclosureText ?? null,
    p_evidence: params.evidence ?? {},
  });
  if (consentError) throw new Error(`WhatsApp consent update failed: ${consentError.message}`);
  return true;
}
