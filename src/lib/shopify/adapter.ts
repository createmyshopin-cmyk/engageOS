import "server-only";
import { ShopifyApiError, ShopifyClient } from "@/lib/shopify/client";
import { decryptSecret, encryptSecret } from "@/lib/wacrm/crypto";
import {
  deleteShop,
  getShop,
  setShopStatus,
  updateShopAccessToken,
  upsertShop,
} from "@/lib/shopify/store";
import {
  exchangeClientCredentials,
  ShopifyClientCredentialsError,
} from "@/lib/shopify/oauth";
import type { ShopifyShop } from "@/lib/shopify/types";

/**
 * Tenant-aware facade over the Shopify Admin client — the single entry point
 * the sync engine uses. Resolves a tenant's shop row, decrypts the token, and
 * hands back a ready client. The token never leaves the server; Shopify is
 * never called from the browser. Mirrors wacrm/adapter.ts.
 *
 * Token model (Dev Dashboard apps, post-2026): the stored access token is
 * short-lived (~24h). Before handing out a client we transparently re-exchange
 * the merchant's Client ID/Secret when the cached token is at/near expiry, so
 * the sync engine never has to think about token lifetime.
 */

export interface TenantShopify {
  client: ShopifyClient;
  shop: ShopifyShop;
}

/** Re-exchange this soon before the cached token's stated expiry (safety margin). */
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Ensure the shop has a live access token, re-exchanging client credentials when
 * the cached one is missing or (nearly) expired. Returns the usable plaintext
 * token, or null when the shop has no client credentials to refresh with (legacy
 * permanent-token rows keep working — their token_expires_at is null).
 */
async function ensureFreshToken(shop: ShopifyShop): Promise<string | null> {
  const expiresAt = shop.token_expires_at ? new Date(shop.token_expires_at).getTime() : null;
  const stillValid = expiresAt !== null && expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS;

  // A valid cached token, or a legacy permanent token (no expiry) → use as-is.
  if (shop.access_token_enc && (stillValid || expiresAt === null)) {
    try {
      return decryptSecret(shop.access_token_enc);
    } catch {
      return null;
    }
  }

  // Expired/absent → re-exchange the merchant's client credentials.
  if (!shop.client_id || !shop.client_secret_enc) return null;
  let clientSecret: string;
  try {
    clientSecret = decryptSecret(shop.client_secret_enc);
  } catch {
    return null;
  }
  try {
    const grant = await exchangeClientCredentials(shop.shop_domain, shop.client_id, clientSecret);
    const newExpiry = new Date(Date.now() + grant.expiresIn * 1000).toISOString();
    await updateShopAccessToken(shop.business_id, encryptSecret(grant.accessToken), newExpiry);
    shop.access_token_enc = encryptSecret(grant.accessToken);
    shop.token_expires_at = newExpiry;
    return grant.accessToken;
  } catch {
    return null; // couldn't refresh → treat as disconnected for this call
  }
}

/** Shopify handle for a tenant, or null when not connected. Never throws on "not set up". */
export async function getShopifyForBusiness(businessId: string): Promise<TenantShopify | null> {
  const shop = await getShop(businessId);
  if (!shop || shop.status !== "active") return null;
  const token = await ensureFreshToken(shop);
  if (!token) return null;
  return { client: new ShopifyClient(shop.shop_domain, token), shop };
}

/** The topics we subscribe to. Inbound handlers live in the shopify module. */
export const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "customers/create",
  "customers/update",
  "products/create",
  "products/update",
  "products/delete",
  "collections/create",
  "collections/update",
  "inventory_levels/update",
  "discounts/create",
  "discounts/update",
  "app/uninstalled",
] as const;

/** Webhook receiver URL for this deployment, or null when not publicly https. */
function webhookAddress(): string | null {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!origin.startsWith("https://")) return null; // Shopify refuses non-https targets
  return `${origin}/api/webhooks/shopify`;
}

export interface ConnectResult {
  ok: boolean;
  error?: string;
  webhooksRegistered?: number;
}

/**
 * Persist a freshly-obtained access token (already exchanged via OAuth),
 * register webhooks, and store the per-shop webhook secret (encrypted). Called
 * from the OAuth callback after token exchange. `businessId` comes from the
 * consumed OAuth state, never from the request.
 */
export async function connectShopify(
  businessId: string,
  shopDomain: string,
  accessToken: string,
  scopes: string
): Promise<ConnectResult> {
  // Store the encrypted token first so the connection is usable even if webhook
  // registration is flaky. The app-wide SHOPIFY_WEBHOOK_SECRET verifies inbound
  // HMACs (public apps sign with the app secret), so we don't need a per-shop
  // secret; leave webhook_secret_enc null to fall back to the app secret.
  await upsertShop(businessId, {
    shop_domain: shopDomain,
    access_token_enc: encryptSecret(accessToken),
    scopes,
    status: "active",
  });

  // Register webhooks (best-effort — a local/non-https deploy still connects).
  let registered = 0;
  const address = webhookAddress();
  if (address) {
    const client = new ShopifyClient(shopDomain, accessToken);
    let existing: Set<string>;
    try {
      const hooks = await client.listWebhooks();
      existing = new Set(hooks.filter((h) => h.address === address).map((h) => h.topic));
    } catch {
      existing = new Set();
    }
    for (const topic of WEBHOOK_TOPICS) {
      if (existing.has(topic)) continue;
      try {
        const id = await client.createWebhook(topic, address);
        if (id) registered += 1;
      } catch (err) {
        console.error(`Shopify webhook registration failed for ${topic}:`, err);
      }
    }
  }

  return { ok: true, webhooksRegistered: registered };
}

export interface CredentialConnectResult extends ConnectResult {
  shopName: string;
  scopes: string;
}

/**
 * Connect a store via a merchant-supplied DEV DASHBOARD APP (multi-tenant model —
 * no global OAuth app). Shopify retired admin-created custom apps on 2026-01-01;
 * merchants now build an app in the Dev Dashboard inside their own org and supply
 * its Client ID + Client Secret. There is no permanent `shpat_…` token anymore —
 * we exchange those credentials for a SHORT-LIVED access token via the OAuth
 * client-credentials grant, and re-exchange on demand as it expires (24h).
 *
 * We validate before persisting: the exchange itself proves the credentials are
 * real (401 → bad secret, 400 shop_not_permitted → app + store not in the same
 * org), and the resulting token is checked against `shop.json`. On success the
 * Client ID is stored in the clear, the Client Secret is AES-256-GCM encrypted
 * (and reused as the per-shop webhook HMAC key — Dev Dashboard apps sign webhooks
 * with the client secret), the first token + its expiry are cached, webhooks are
 * registered best-effort, and granted scopes are recorded.
 *
 * `businessId` is the authenticated tenant (from the session) — never input.
 */
export async function connectWithCredentials(
  businessId: string,
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<CredentialConnectResult> {
  const domain = shopDomain.trim().toLowerCase();

  // 1. Exchange the merchant's Client ID/Secret for a short-lived access token.
  //    The exchange is itself the credential check — no separate probe needed.
  let accessToken: string;
  let expiresIn: number;
  let grantedScope: string;
  try {
    const grant = await exchangeClientCredentials(domain, clientId, clientSecret);
    accessToken = grant.accessToken;
    expiresIn = grant.expiresIn;
    grantedScope = grant.scope;
  } catch (err) {
    if (err instanceof ShopifyClientCredentialsError) {
      if (err.isAuthError) {
        throw new Error(
          "Shopify rejected the Client ID or Client Secret. Check both were copied in full from the app's API credentials."
        );
      }
      if (err.isShopNotPermitted) {
        throw new Error(
          "This app is not installed on that store, or the app and store are in different Shopify organizations. Build the app in the same org as the store and install it."
        );
      }
      throw new Error(`Shopify rejected the connection (${err.status}). Check the store domain and credentials.`);
    }
    throw new Error(
      `Could not reach the store: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const client = new ShopifyClient(domain, accessToken);

  // 2. Confirm the token actually works against the live API (and get the name).
  let shopName = "";
  try {
    const info = await client.getShopInfo();
    shopName = info.name;
  } catch (err) {
    if (err instanceof ShopifyApiError && err.status === 404) {
      throw new Error("That store domain was not found. Check the myshopify.com domain.");
    }
    throw new Error(
      `Could not reach the store: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Prefer live-read scopes; fall back to the scope returned by the grant.
  let scopes = "";
  try {
    scopes = await client.getAccessScopes();
  } catch {
    scopes = grantedScope;
  }
  if (!scopes) scopes = grantedScope;

  // 4. Persist encrypted credentials. The Client Secret is stored twice: as the
  //    long-lived credential we re-exchange with, and as the per-shop webhook
  //    HMAC key (Dev Dashboard apps sign webhooks with the client secret).
  const secretEnc = encryptSecret(clientSecret);
  await upsertShop(businessId, {
    shop_domain: domain,
    access_token_enc: encryptSecret(accessToken),
    client_id: clientId,
    client_secret_enc: secretEnc,
    webhook_secret_enc: secretEnc,
    token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes,
    status: "active",
  });

  // 5. Register webhooks best-effort (a non-https deploy still connects).
  let registered = 0;
  const address = webhookAddress();
  if (address) {
    let existing: Set<string>;
    try {
      const hooks = await client.listWebhooks();
      existing = new Set(hooks.filter((h) => h.address === address).map((h) => h.topic));
    } catch {
      existing = new Set();
    }
    for (const topic of WEBHOOK_TOPICS) {
      if (existing.has(topic)) continue;
      try {
        const id = await client.createWebhook(topic, address);
        if (id) registered += 1;
      } catch (err) {
        console.error(`Shopify webhook registration failed for ${topic}:`, err);
      }
    }
  }

  return { ok: true, webhooksRegistered: registered, shopName, scopes };
}

/**
 * Disconnect: mark the shop revoked and drop the encrypted token. We do NOT try
 * to delete webhooks on Shopify's side — on an app/uninstalled event the token
 * is already dead, and on a manual disconnect leaving them is harmless (they'll
 * be rejected at ingest once the shop is revoked). Idempotent.
 */
export async function disconnectShopify(businessId: string): Promise<void> {
  await deleteShop(businessId);
}

/** Soft-disconnect on app/uninstalled: keep the row for audit, revoke access. */
export async function markUninstalled(businessId: string): Promise<void> {
  await setShopStatus(businessId, "revoked");
}
