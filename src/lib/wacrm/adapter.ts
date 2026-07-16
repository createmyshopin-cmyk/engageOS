import "server-only";
import { WacrmClient, WacrmApiError } from "@/lib/wacrm/client";
import { decryptSecret, encryptSecret } from "@/lib/wacrm/crypto";
import {
  deleteIntegration,
  getIntegration,
  patchIntegration,
  upsertIntegration,
} from "@/lib/wacrm/store";
import { REQUIRED_SCOPES, type WacrmIntegration } from "@/lib/wacrm/types";

/**
 * Tenant-aware facade over the wacrm client — the single entry point the
 * rest of EngageOS uses. Resolves a tenant's integration row, decrypts the
 * key, and hands back a ready client. UI never sees the key; wacrm is never
 * called from the browser.
 */

export interface TenantWacrm {
  client: WacrmClient;
  integration: WacrmIntegration;
}

/** wacrm handle for a tenant, or null when not connected. Never throws on "not set up". */
export async function getWacrmForBusiness(
  businessId: string
): Promise<TenantWacrm | null> {
  const integration = await getIntegration(businessId);
  if (!integration || integration.status === "disconnected") return null;
  return {
    client: new WacrmClient(integration.base_url, decryptSecret(integration.api_key_enc), businessId),
    integration,
  };
}

const WEBHOOK_EVENTS = ["message.status_updated", "message.received"];

/** Webhook receiver URL for this deployment, or null when not publicly reachable. */
function webhookUrl(): string | null {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!origin.startsWith("https://")) return null; // wacrm refuses non-https targets
  return `${origin}/api/webhooks/wacrm`;
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  accountName?: string;
  missingScopes?: string[];
  webhookRegistered?: boolean;
}

/**
 * Verify a merchant-supplied wacrm base URL + API key, register the
 * delivery-status webhook, and persist the (encrypted) integration.
 * One EngageOS merchant ↔ one wacrm account.
 */
export async function connectWacrm(
  businessId: string,
  baseUrl: string,
  apiKey: string
): Promise<ConnectResult> {
  const client = new WacrmClient(baseUrl, apiKey, businessId);

  let me;
  try {
    me = (await client.me()).data;
  } catch (err) {
    const msg =
      err instanceof WacrmApiError && err.status === 401
        ? "wacrm rejected the API key. Check it was copied fully and is not revoked."
        : `Could not reach wacrm: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, error: msg };
  }

  const missingScopes = REQUIRED_SCOPES.filter((s) => !me.key.scopes.includes(s));
  if (missingScopes.length > 0) {
    return {
      ok: false,
      missingScopes,
      error: `The API key is missing scopes: ${missingScopes.join(", ")}. Grant them in wacrm → Settings → API keys.`,
    };
  }

  // Register the outbound webhook (best-effort — a local/non-https deploy
  // still connects, it just won't receive live delivery statuses).
  let webhookId: string | null = null;
  let webhookSecretEnc: string | null = null;
  const url = webhookUrl();
  if (url) {
    try {
      const { data: hook } = await client.registerWebhook(url, WEBHOOK_EVENTS);
      webhookId = hook.id;
      if (hook.secret) webhookSecretEnc = encryptSecret(hook.secret);
    } catch (err) {
      console.error("wacrm webhook registration failed:", err);
    }
  }

  await upsertIntegration(businessId, {
    provider: "wacrm",
    base_url: baseUrl.replace(/\/+$/, ""),
    api_key_enc: encryptSecret(apiKey),
    api_key_last4: apiKey.slice(-4),
    account_id: me.account.id,
    account_name: me.account.name,
    webhook_id: webhookId,
    webhook_secret_enc: webhookSecretEnc,
    status: "connected",
    last_error: null,
    last_verified_at: new Date().toISOString(),
  });

  return { ok: true, accountName: me.account.name, webhookRegistered: !!webhookId };
}

/** Disconnect: remove the wacrm webhook (best-effort) and drop the mapping. */
export async function disconnectWacrm(businessId: string): Promise<void> {
  const tenant = await getWacrmForBusiness(businessId);
  if (tenant?.integration.webhook_id) {
    try {
      await tenant.client.deleteWebhook(tenant.integration.webhook_id);
    } catch (err) {
      console.error("wacrm webhook removal failed (continuing):", err);
    }
  }
  await deleteIntegration(businessId);
}

/** Update coupon-delivery settings (template name/language, auto-send). */
export async function updateCouponSettings(
  businessId: string,
  settings: {
    couponTemplateName: string | null;
    couponTemplateLanguage: string;
    autoSendCoupons: boolean;
  }
): Promise<void> {
  await patchIntegration(businessId, {
    coupon_template_name: settings.couponTemplateName,
    coupon_template_language: settings.couponTemplateLanguage,
    auto_send_coupons: settings.autoSendCoupons,
  });
}

/** Mark the integration errored (e.g. auth started failing) without dropping it. */
export async function flagIntegrationError(
  businessId: string,
  message: string
): Promise<void> {
  try {
    await patchIntegration(businessId, { status: "error", last_error: message });
  } catch (err) {
    console.error("flagIntegrationError failed:", err);
  }
}
