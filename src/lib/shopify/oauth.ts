import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Shopify OAuth (public app) helpers — the install handshake, built on `fetch`
 * (no SDK). Flow:
 *   1. install:  redirect the merchant to Shopify's authorize URL with a
 *      random `state` nonce we persist (CSRF protection).
 *   2. callback: Shopify redirects back with `?code&shop&state&hmac`. We verify
 *      the request HMAC, match `state`, then exchange `code` for a permanent
 *      Admin API access token.
 *
 * Secrets (SHOPIFY_API_KEY / SHOPIFY_API_SECRET) live only server-side. The
 * token returned by exchange is encrypted before it ever touches the DB.
 */

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export interface ShopifyOAuthConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  appUrl: string;
}

/** Read + validate the OAuth env. Throws if the app isn't configured. */
export function oauthConfig(): ShopifyOAuthConfig {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  const apiSecret = process.env.SHOPIFY_API_SECRET?.trim();
  const scopes =
    process.env.SHOPIFY_SCOPES?.trim() ||
    "read_products,read_orders,read_customers,read_inventory,read_price_rules,read_discounts";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!apiKey || !apiSecret) {
    throw new Error("Shopify OAuth is not configured (SHOPIFY_API_KEY / SHOPIFY_API_SECRET).");
  }
  return { apiKey, apiSecret, scopes, appUrl };
}

/** True for a well-formed `*.myshopify.com` domain (defends the redirect target). */
export function isValidShopDomain(shop: string | null | undefined): shop is string {
  return !!shop && SHOP_DOMAIN_RE.test(shop.trim().toLowerCase());
}

export function normalizeShopDomain(shop: string): string {
  return shop.trim().toLowerCase();
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

/** Build the Shopify authorize URL the merchant is redirected to. */
export function buildAuthorizeUrl(shop: string, state: string): string {
  const cfg = oauthConfig();
  const redirectUri = `${cfg.appUrl}/api/shopify/callback`;
  const url = new URL(`https://${normalizeShopDomain(shop)}/admin/oauth/authorize`);
  url.searchParams.set("client_id", cfg.apiKey);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Verify the HMAC on an OAuth callback / request query. Shopify signs the query
 * string (minus `hmac`/`signature`), sorted, `&`-joined, keyed by the app
 * secret. Constant-time compared.
 */
export function verifyOAuthHmac(params: URLSearchParams): boolean {
  const provided = params.get("hmac");
  if (!provided) return false;

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hmac" || k === "signature") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const message = pairs.join("&");
  const digest = createHmac("sha256", oauthConfig().apiSecret).update(message).digest("hex");

  const a = Buffer.from(digest);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

/** Exchange the temporary `code` for a permanent Admin API access token. */
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<TokenExchangeResult> {
  const cfg = oauthConfig();
  const res = await fetch(`https://${normalizeShopDomain(shop)}/admin/oauth/access_token`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: cfg.apiKey,
      client_secret: cfg.apiSecret,
      code,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Shopify token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const body = (await res.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) {
    throw new Error("Shopify token exchange returned no access_token");
  }
  return { accessToken: body.access_token, scope: body.scope ?? cfg.scopes };
}

export interface ClientCredentialsResult {
  accessToken: string;
  scope: string;
  /** Seconds until the token expires (Shopify returns ~86399 ≈ 24h). */
  expiresIn: number;
}

/**
 * Client-credentials grant — the token flow for apps built in Shopify's new Dev
 * Dashboard (admin-created custom apps were retired 2026-01-01). The merchant's
 * own app supplies a Client ID + Client Secret; we exchange them directly with
 * the store for a SHORT-LIVED Admin API access token (no user interaction).
 *
 * Only works when the app and store are in the same Shopify organization, which
 * is exactly our multi-tenant case: each merchant builds the app in their own
 * org and installs it on their own store. Tokens last ~24h and are re-exchanged
 * on demand (we never persist a permanent token in this model).
 *
 * CRITICAL: the body MUST be form-urlencoded — Shopify rejects application/json
 * for this endpoint. Credentials come from the caller, NOT from env.
 */
export async function exchangeClientCredentials(
  shop: string,
  clientId: string,
  clientSecret: string
): Promise<ClientCredentialsResult> {
  const domain = normalizeShopDomain(shop);
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ShopifyClientCredentialsError(res.status, detail.slice(0, 300));
  }
  const body = (await res.json()) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new ShopifyClientCredentialsError(res.status, "no access_token in response");
  }
  return {
    accessToken: body.access_token,
    scope: body.scope ?? "",
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 86_399,
  };
}

/** Typed failure for the client-credentials exchange (maps to a merchant message). */
export class ShopifyClientCredentialsError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`Shopify client-credentials exchange failed (${status}): ${detail}`);
    this.name = "ShopifyClientCredentialsError";
  }

  /** 401 — bad client id/secret. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** 400 shop_not_permitted — app + store not in the same Shopify org. */
  get isShopNotPermitted(): boolean {
    return this.detail.includes("shop_not_permitted");
  }
}
