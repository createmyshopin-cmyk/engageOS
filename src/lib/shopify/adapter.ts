import "server-only";
import { ShopifyClient } from "@/lib/shopify/client";
import { decryptSecret, encryptSecret } from "@/lib/wacrm/crypto";
import { deleteShop, getShop, setShopStatus, upsertShop } from "@/lib/shopify/store";
import type { ShopifyShop } from "@/lib/shopify/types";

/**
 * Tenant-aware facade over the Shopify Admin client — the single entry point
 * the sync engine uses. Resolves a tenant's shop row, decrypts the token, and
 * hands back a ready client. The token never leaves the server; Shopify is
 * never called from the browser. Mirrors wacrm/adapter.ts.
 */

export interface TenantShopify {
  client: ShopifyClient;
  shop: ShopifyShop;
}

/** Shopify handle for a tenant, or null when not connected. Never throws on "not set up". */
export async function getShopifyForBusiness(businessId: string): Promise<TenantShopify | null> {
  const shop = await getShop(businessId);
  if (!shop || shop.status !== "active" || !shop.access_token_enc) return null;
  let token: string;
  try {
    token = decryptSecret(shop.access_token_enc);
  } catch {
    return null; // token unreadable → treat as disconnected
  }
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
