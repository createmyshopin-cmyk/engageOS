import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import type { WatiIntegration } from "@/lib/wati/types";

/**
 * Integration-layer persistence for the WATI bridge. Every helper is
 * explicitly scoped by business_id so nothing can cross a tenant boundary.
 * Mirrors src/lib/wacrm/store.ts and is kept OUT of TenantRepository on
 * purpose — the core repository stays unmodified.
 */

export async function getWatiIntegration(
  businessId: string
): Promise<WatiIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("wati_integrations")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getWatiIntegration failed: ${error.message}`);
  return (data as WatiIntegration | null) ?? null;
}

export async function upsertWatiIntegration(
  businessId: string,
  row: Partial<WatiIntegration>
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("wati_integrations")
    .upsert(
      { ...row, business_id: businessId, updated_at: new Date().toISOString() },
      { onConflict: "business_id" }
    );
  if (error) throw new Error(`upsertWatiIntegration failed: ${error.message}`);
}

export async function patchWatiIntegration(
  businessId: string,
  patch: Partial<WatiIntegration>
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("wati_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) throw new Error(`patchWatiIntegration failed: ${error.message}`);
}

export async function deleteWatiIntegration(businessId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("wati_integrations")
    .delete()
    .eq("business_id", businessId);
  if (error) throw new Error(`deleteWatiIntegration failed: ${error.message}`);
}

/**
 * Resolve the single tenant a webhook belongs to by its opaque bearer
 * token. The token column is UNIQUE, so this maps a webhook to EXACTLY
 * one business or to nobody — a webhook can never straddle tenants.
 * Returns null for an unknown/blank token (invalid verification).
 */
export async function getWatiIntegrationByWebhookToken(
  token: string
): Promise<WatiIntegration | null> {
  if (!token || token.length < 20) return null;
  const { data, error } = await supabaseAdmin()
    .from("wati_integrations")
    .select("*")
    .eq("webhook_token", token)
    .maybeSingle();
  if (error) throw new Error(`getWatiIntegrationByWebhookToken failed: ${error.message}`);
  return (data as WatiIntegration | null) ?? null;
}

/**
 * Atomically claim a webhook delivery for processing. Returns true if
 * THIS call won the race (first time we've seen this event) and false if
 * the event was already claimed — WATI retries an event up to 144 times
 * over 24h, and the UNIQUE(business_id, dedup_key) constraint collapses
 * every retry onto the first claim. Scoped by business_id so one tenant's
 * ledger can never suppress another's.
 */
export async function claimWatiWebhookDelivery(params: {
  businessId: string;
  dedupKey: string;
  eventType: string;
}): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("wati_webhook_deliveries")
    .insert({
      business_id: params.businessId,
      dedup_key: params.dedupKey,
      event_type: params.eventType,
    });
  if (!error) return true;
  // 23505 = unique_violation → a prior delivery already claimed it.
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`claimWatiWebhookDelivery failed: ${error.message}`);
}
