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
