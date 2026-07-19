import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import {
  generateMerchantApiKey,
  ZAPIER_KEY_SCOPES,
} from "@/lib/zapier/keys";
import type {
  MerchantApiKey,
  ZapierHookPublic,
  ZapierHookSubscription,
  ZapierIntegration,
  ZapierIntegrationPublic,
} from "@/lib/zapier/types";
import type { ZapierEvent } from "@/lib/zapier/events";

const DISCONNECTED_PUBLIC: ZapierIntegrationPublic = {
  status: "disconnected",
  apiKeyPrefix: null,
  activeSubscriptions: 0,
  connectedAt: null,
  zapierAccountLabel: null,
};

function isZapierSchemaMissing(message: string): boolean {
  return (
    message.includes("merchant_api_keys") ||
    message.includes("zapier_integrations") ||
    message.includes("zapier_hook_subscriptions") ||
    message.includes("schema cache")
  );
}

export async function getZapierIntegration(
  businessId: string
): Promise<ZapierIntegration | null> {
  const { data, error } = await supabaseAdmin()
    .from("zapier_integrations")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getZapierIntegration failed: ${error.message}`);
  return (data as ZapierIntegration | null) ?? null;
}

export async function getActiveMerchantApiKey(
  businessId: string
): Promise<MerchantApiKey | null> {
  const { data, error } = await supabaseAdmin()
    .from("merchant_api_keys")
    .select("*")
    .eq("business_id", businessId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveMerchantApiKey failed: ${error.message}`);
  return (data as MerchantApiKey | null) ?? null;
}

export async function findActiveKeyByHash(hash: string): Promise<MerchantApiKey | null> {
  const { data, error } = await supabaseAdmin()
    .from("merchant_api_keys")
    .select("*")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error) {
    console.error("[zapier/store] key lookup error:", error.message);
    return null;
  }
  if (!data || data.revoked_at) return null;
  return data as MerchantApiKey;
}

export function touchKeyLastUsed(id: string): void {
  void supabaseAdmin()
    .from("merchant_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id)
    .then(({ error }) => {
      if (error) {
        console.warn("[zapier/store] last_used_at bump failed:", error.message);
      }
    });
}

export async function countActiveHooks(businessId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("zapier_hook_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (error) throw new Error(`countActiveHooks failed: ${error.message}`);
  return count ?? 0;
}

export async function listActiveHooks(businessId: string): Promise<ZapierHookPublic[]> {
  const { data, error } = await supabaseAdmin()
    .from("zapier_hook_subscriptions")
    .select("id, event_name, is_active, last_delivery_at, created_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listActiveHooks failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventName: row.event_name as string,
    isActive: row.is_active as boolean,
    lastDeliveryAt: row.last_delivery_at as string | null,
    createdAt: row.created_at as string,
  }));
}

export async function getZapierIntegrationPublic(
  businessId: string
): Promise<ZapierIntegrationPublic> {
  try {
    const [integration, key, activeSubscriptions] = await Promise.all([
      getZapierIntegration(businessId),
      getActiveMerchantApiKey(businessId),
      countActiveHooks(businessId),
    ]);
    const connected = !!integration && integration.status === "connected" && !!key;
    return {
      status: connected ? "connected" : "disconnected",
      apiKeyPrefix: key?.key_prefix ?? null,
      activeSubscriptions,
      connectedAt: integration?.connected_at ?? null,
      zapierAccountLabel: integration?.zapier_account_label ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isZapierSchemaMissing(message)) {
      console.warn("[zapier/store] Zapier tables not ready:", message);
      return DISCONNECTED_PUBLIC;
    }
    throw err;
  }
}

/** Mint a fresh API key and mark the integration connected. Returns plaintext once. */
export async function connectZapier(
  businessId: string
): Promise<{ apiKey: string; integration: ZapierIntegrationPublic }> {
  const { plaintext, hash, prefix } = generateMerchantApiKey();
  const now = new Date().toISOString();

  // Revoke any existing active keys for this business.
  await supabaseAdmin()
    .from("merchant_api_keys")
    .update({ revoked_at: now })
    .eq("business_id", businessId)
    .is("revoked_at", null);

  const { error: keyError } = await supabaseAdmin().from("merchant_api_keys").insert({
    business_id: businessId,
    name: "Zapier",
    key_prefix: prefix,
    key_hash: hash,
    scopes: [...ZAPIER_KEY_SCOPES],
  });
  if (keyError) throw new Error(`connectZapier key insert failed: ${keyError.message}`);

  const { error: intError } = await supabaseAdmin().from("zapier_integrations").upsert(
    {
      business_id: businessId,
      status: "connected",
      connected_at: now,
      updated_at: now,
    },
    { onConflict: "business_id" }
  );
  if (intError) throw new Error(`connectZapier integration upsert failed: ${intError.message}`);

  const integration = await getZapierIntegrationPublic(businessId);
  return { apiKey: plaintext, integration };
}

export async function disconnectZapier(businessId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin()
    .from("merchant_api_keys")
    .update({ revoked_at: now })
    .eq("business_id", businessId)
    .is("revoked_at", null);

  await supabaseAdmin()
    .from("zapier_hook_subscriptions")
    .update({ is_active: false })
    .eq("business_id", businessId)
    .eq("is_active", true);

  await supabaseAdmin()
    .from("zapier_integrations")
    .upsert(
      {
        business_id: businessId,
        status: "disconnected",
        updated_at: now,
      },
      { onConflict: "business_id" }
    );
}

export async function createHookSubscription(
  businessId: string,
  hookUrl: string,
  eventName: ZapierEvent
): Promise<ZapierHookSubscription> {
  const { data, error } = await supabaseAdmin()
    .from("zapier_hook_subscriptions")
    .insert({
      business_id: businessId,
      hook_url: hookUrl,
      event_name: eventName,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createHookSubscription failed: ${error.message}`);
  return data as ZapierHookSubscription;
}

export async function deleteHookSubscription(
  businessId: string,
  hookId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("zapier_hook_subscriptions")
    .delete()
    .eq("id", hookId)
    .eq("business_id", businessId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`deleteHookSubscription failed: ${error.message}`);
  return !!data;
}

export async function getBusinessName(businessId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.name as string) ?? null;
}

export async function findRecentEventForSample(
  businessId: string,
  eventName: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin()
    .from("campaign_events")
    .select("event_type, metadata, created_at, campaign_id")
    .eq("business_id", businessId)
    .eq("event_type", eventName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    event: data.event_type,
    occurred_at: data.created_at,
    campaign_id: data.campaign_id,
    ...(typeof data.metadata === "object" && data.metadata !== null
      ? (data.metadata as Record<string, unknown>)
      : {}),
  };
}
