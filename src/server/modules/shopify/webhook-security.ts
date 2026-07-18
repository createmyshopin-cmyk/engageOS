import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/db/rpc";
import { decryptSecret } from "@/lib/wacrm/crypto";

/**
 * Shopify webhook security + tenant resolution.
 *
 * Shopify signs every webhook with HMAC-SHA256 over the RAW request body, keyed
 * by the app's shared secret (or a per-shop secret), base64-encoded in the
 * `X-Shopify-Hmac-Sha256` header. We MUST verify against the exact bytes we
 * received — parsing then re-serializing would change the bytes and break the
 * check — so the route reads `await req.text()` and passes it here untouched.
 *
 * Tenant isolation: the `X-Shopify-Shop-Domain` header maps to exactly one
 * `shopify_shops` row (unique per business), which yields the business_id. A
 * shop we don't know is rejected — a webhook can never act on an unmapped or
 * foreign tenant.
 */

export interface ShopifyTenant {
  businessId: string;
  shopDomain: string;
  /** Per-shop HMAC secret if configured, else the app-wide secret is used. */
  webhookSecret: string;
}

/** App-wide Shopify webhook secret (fallback when a shop has no own secret). */
function appSecret(): string | null {
  return process.env.SHOPIFY_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Constant-time verify of the base64 HMAC header against the raw body.
 * Returns false on any mismatch, malformed header, or missing secret.
 */
export function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Resolve the tenant for an inbound webhook from its shop-domain header.
 * Loads the per-shop secret (decrypted) or falls back to the app secret.
 * Returns null when the shop is unknown or no secret is available to verify.
 */
export async function resolveShopifyTenant(shopDomain: string | null): Promise<ShopifyTenant | null> {
  const domain = shopDomain?.trim().toLowerCase();
  if (!domain) return null;

  const { data, error } = await adminClient()
    .from("shopify_shops")
    .select("business_id, shop_domain, webhook_secret_enc, status")
    .eq("shop_domain", domain)
    .maybeSingle<{
      business_id: string;
      shop_domain: string;
      webhook_secret_enc: string | null;
      status: string;
    }>();

  if (error || !data || data.status !== "active") return null;

  let secret = appSecret();
  if (data.webhook_secret_enc) {
    try {
      secret = decryptSecret(data.webhook_secret_enc);
    } catch {
      // Fall back to the app secret if the stored secret can't be decrypted.
    }
  }
  if (!secret) return null;

  return { businessId: data.business_id, shopDomain: data.shop_domain, webhookSecret: secret };
}
