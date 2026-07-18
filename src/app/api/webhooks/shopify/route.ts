import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import {
  verifyShopifyHmac,
  resolveShopifyTenant,
} from "@/server/modules/shopify/webhook-security";
import { ShopifyIngestionService } from "@/server/modules/shopify/service";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

/**
 * Inbound Shopify webhook — POST /api/webhooks/shopify
 *
 * Security & tenancy (see webhook-security.ts):
 *   - Authenticated by HMAC-SHA256 over the RAW body (X-Shopify-Hmac-Sha256),
 *     NOT by a cookie session — so this route deliberately bypasses the
 *     defineRoute() cookie guard.
 *   - Tenant resolved from X-Shopify-Shop-Domain → exactly one shopify_shops
 *     row. business_id comes from that row, NEVER from the payload.
 *
 * Idempotency (retry/duplicate safe, see service.ts):
 *   - X-Shopify-Webhook-Id is claimed via shopify_log_webhook; a redelivery
 *     is dropped. Order upsert + event dedup add a second layer.
 *
 * Flow: read raw bytes → verify HMAC → resolve tenant → 200 ACK immediately →
 * process asynchronously via after() so a slow ingest never triggers Shopify's
 * retry storm.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  const log = createLogger(correlationId, { route: "webhooks/shopify" });

  // Read the exact bytes Shopify signed. Parsing here would change the bytes
  // and break HMAC verification, so we keep the raw string.
  const rawBody = await request.text();

  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic");
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  // Resolve tenant first (also yields the secret we verify against). An unknown
  // shop is rejected — a webhook can never act on an unmapped/foreign tenant.
  const tenant = await resolveShopifyTenant(shopDomain);
  if (!tenant) {
    log.warn("shopify.webhook.unknown_shop", { shopDomain });
    return NextResponse.json({ ok: false, error: "unknown shop" }, { status: 401 });
  }

  if (!verifyShopifyHmac(rawBody, hmacHeader, tenant.webhookSecret)) {
    log.warn("shopify.webhook.hmac_failed", { shopDomain: tenant.shopDomain });
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  if (!topic || !webhookId) {
    // Verified but missing routing headers — ACK so Shopify doesn't retry a
    // request we could never process.
    log.warn("shopify.webhook.missing_headers", { topic, webhookId });
    return NextResponse.json({ ok: true, status: "ignored" }, { status: 200 });
  }

  // Parse defensively after verification; a malformed-but-signed body is ACKed.
  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    log.warn("shopify.webhook.unparseable_body");
    return NextResponse.json({ ok: true, status: "ignored" }, { status: 200 });
  }

  log.info("shopify.webhook.received", { topic, shopDomain: tenant.shopDomain });

  // Fast ACK; idempotency claim + ingestion happen after the response flushes.
  const service = new ShopifyIngestionService(tenant, log);
  after(async () => {
    await service.process({ webhookId, topic }, payload);
  });

  return NextResponse.json({ ok: true, status: "received" }, { status: 200 });
}
