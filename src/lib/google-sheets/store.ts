import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import { generateSheetsApiKey } from "@/lib/google-sheets/keys";
import { seedDefaultFeeds } from "@/lib/google-sheets/feeds-store";
import type { GoogleSheetsIntegration } from "@/lib/google-sheets/types";

export async function getGoogleSheetsIntegration(
  businessId: string
): Promise<GoogleSheetsIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getGoogleSheetsIntegration failed: ${error.message}`);
  return (data as GoogleSheetsIntegration | null) ?? null;
}

export async function getGoogleSheetsIntegrationByApiKeyHash(
  keyHash: string
): Promise<GoogleSheetsIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .select("*")
    .eq("api_key_hash", keyHash)
    .eq("status", "connected")
    .maybeSingle();
  if (error) {
    throw new Error(`getGoogleSheetsIntegrationByApiKeyHash failed: ${error.message}`);
  }
  return (data as GoogleSheetsIntegration | null) ?? null;
}

/** Strip trailing slashes from the EngageOS webapp base URL. */
export function normalizeWebappUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Generate a fresh API key and upsert the integration row. Returns plaintext once. */
export async function connectGoogleSheets(
  businessId: string,
  spreadsheetUrl?: string | null,
  webappUrl?: string | null
): Promise<{ integration: GoogleSheetsIntegration; apiKey: string }> {
  const { plaintext, hash, prefix } = generateSheetsApiKey();
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .upsert(
      {
        business_id: businessId,
        api_key_hash: hash,
        api_key_prefix: prefix,
        status: "connected",
        spreadsheet_url: spreadsheetUrl?.trim() || null,
        webapp_url: webappUrl ? normalizeWebappUrl(webappUrl) : null,
        updated_at: now,
      },
      { onConflict: "business_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`connectGoogleSheets failed: ${error.message}`);
  await seedDefaultFeeds(businessId);
  return { integration: data as GoogleSheetsIntegration, apiKey: plaintext };
}

export async function disconnectGoogleSheets(businessId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .update({
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);
  if (error) throw new Error(`disconnectGoogleSheets failed: ${error.message}`);
}

export async function patchGoogleSheetsIntegration(
  businessId: string,
  patch: Partial<Pick<GoogleSheetsIntegration, "spreadsheet_url" | "webapp_url">>
): Promise<void> {
  const normalized = { ...patch };
  if (typeof normalized.webapp_url === "string") {
    normalized.webapp_url = normalizeWebappUrl(normalized.webapp_url);
  }
  const { error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .update({ ...normalized, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("status", "connected");
  if (error) throw new Error(`patchGoogleSheetsIntegration failed: ${error.message}`);
}

export async function touchLastSync(businessId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("google_sheets_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId)
    .eq("status", "connected");
  if (error) throw new Error(`touchLastSync failed: ${error.message}`);
}
