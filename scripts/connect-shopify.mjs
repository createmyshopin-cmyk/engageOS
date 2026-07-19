/**
 * Admin script: connect a Shopify store via Dev Dashboard client credentials.
 * Loads .env.local for Supabase + WACRM_ENCRYPTION_KEY. Credentials via env.
 *
 * Usage:
 *   SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... \
 *     node scripts/connect-shopify.mjs <businessId> <shop.myshopify.com>
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function encryptionKey() {
  let hex = process.env.WACRM_ENCRYPTION_KEY ?? "";
  if (hex.length > 64) hex = hex.slice(0, 64);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("WACRM_ENCRYPTION_KEY missing or invalid in .env.local");
  }
  return Buffer.from(hex, "hex");
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

async function exchangeClientCredentials(shop, clientId, clientSecret) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  }
  if (!body.access_token) throw new Error("No access_token in response");
  return body;
}

async function shopifyGet(shop, token, resourcePath) {
  const res = await fetch(
    `https://${shop}/admin/api/2026-07/${resourcePath}.json`,
    { headers: { "X-Shopify-Access-Token": token, Accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Shopify GET ${resourcePath} failed (${res.status})`);
  return res.json();
}

async function getAccessScopes(shop, token) {
  const res = await fetch(`https://${shop}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`access_scopes failed (${res.status})`);
  const body = await res.json();
  return (body.access_scopes ?? [])
    .map((s) => s.handle)
    .filter(Boolean)
    .join(",");
}

async function supabaseUpsertShop(row) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const res = await fetch(`${url}/rest/v1/shopify_shops`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`shopify_shops upsert failed (${res.status}): ${detail}`);
  }
}

async function enqueueSyncJobs(businessId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resources = [
    "customers",
    "products",
    "orders",
    "collections",
    "inventory",
    "discounts",
  ];
  for (const resource of resources) {
    const res = await fetch(`${url}/rest/v1/rpc/shopify_create_sync_job`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_business_id: businessId,
        p_resource: resource,
        p_mode: "initial",
        p_triggered_by: "system",
        p_scheduled_at: null,
      }),
    });
    if (!res.ok) {
      console.warn(`sync enqueue ${resource} failed:`, await res.text());
    }
  }
}

loadEnvLocal();

const businessId = process.argv[2];
const shopDomain = (process.argv[3] ?? "").trim().toLowerCase();
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();

if (!businessId || !shopDomain || !clientId || !clientSecret) {
  console.error(
    "Usage: SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node scripts/connect-shopify.mjs <businessId> <shop.myshopify.com>"
  );
  process.exit(1);
}

const grant = await exchangeClientCredentials(shopDomain, clientId, clientSecret);
const token = grant.access_token;
const shopBody = await shopifyGet(shopDomain, token, "shop");
const shopName = shopBody.shop?.name ?? shopDomain;
let scopes = "";
try {
  scopes = await getAccessScopes(shopDomain, token);
} catch {
  scopes = grant.scope ?? "";
}

const secretEnc = encryptSecret(clientSecret);
const tokenEnc = encryptSecret(token);
const expiresAt = new Date(Date.now() + (grant.expires_in ?? 86399) * 1000).toISOString();

await supabaseUpsertShop({
  business_id: businessId,
  shop_domain: shopDomain,
  access_token_enc: tokenEnc,
  client_id: clientId,
  client_secret_enc: secretEnc,
  webhook_secret_enc: secretEnc,
  token_expires_at: expiresAt,
  scopes,
  status: "active",
  updated_at: new Date().toISOString(),
});

await enqueueSyncJobs(businessId);

console.log(
  JSON.stringify(
    {
      ok: true,
      businessId,
      shopDomain,
      shopName,
      scopes,
      expiresAt,
    },
    null,
    2
  )
);
