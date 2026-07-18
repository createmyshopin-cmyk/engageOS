import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

// --- Mock the service-role client BEFORE importing modules that use it. ---
const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(() => ({
    update: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }),
  })),
}));
vi.mock("@/lib/db/rpc", () => ({ adminClient: () => ({ rpc, from }) }));
// crypto.ts pulls an env key at call time; not exercised in these tests.
vi.mock("@/lib/wacrm/crypto", () => ({ decryptSecret: (s: string) => s }));

import { verifyShopifyHmac } from "@/server/modules/shopify/webhook-security";
import { ShopifyIngestionService } from "@/server/modules/shopify/service";

const SECRET = "shpss_test_secret_value";
const silentLogger = {
  debug() {}, info() {}, warn() {}, error() {},
  child() { return silentLogger; },
} as any;

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("Shopify HMAC verification", () => {
  it("accepts a correctly-signed raw body", () => {
    const raw = JSON.stringify({ id: 123, total_price: "10.00" });
    expect(verifyShopifyHmac(raw, sign(raw), SECRET)).toBe(true);
  });

  it("rejects a wrong signature, wrong secret, and a missing header", () => {
    const raw = JSON.stringify({ id: 123 });
    expect(verifyShopifyHmac(raw, sign(raw, "other-secret"), SECRET)).toBe(false);
    expect(verifyShopifyHmac(raw, "AAAA", SECRET)).toBe(false);
    expect(verifyShopifyHmac(raw, null, SECRET)).toBe(false);
  });

  it("rejects a tampered body (bytes differ from what was signed)", () => {
    const raw = JSON.stringify({ id: 123, total_price: "10.00" });
    const hmac = sign(raw);
    const tampered = JSON.stringify({ id: 123, total_price: "9999.00" });
    expect(verifyShopifyHmac(tampered, hmac, SECRET)).toBe(false);
  });
});

describe("Shopify idempotency replay", () => {
  const tenant = { businessId: "biz-1", shopDomain: "acme.myshopify.com", webhookSecret: SECRET };
  const meta = { webhookId: "wh-1", topic: "orders/create" };
  const payload = { id: 555, total_price: "20.00", line_items: [] };

  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
  });

  it("ingests on first delivery, then drops the replay without re-ingesting", async () => {
    const svc = new ShopifyIngestionService(tenant, silentLogger);

    // First delivery: claim succeeds (true), ingest RPC succeeds.
    rpc.mockImplementation((fn: string) => {
      if (fn === "shopify_log_webhook") return Promise.resolve({ data: true, error: null });
      if (fn === "shopify_ingest_order") return Promise.resolve({ data: "order-uuid", error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await svc.process(meta, payload);

    const firstIngestCalls = rpc.mock.calls.filter((c) => c[0] === "shopify_ingest_order").length;
    expect(firstIngestCalls).toBe(1);

    // Replay: claim returns false (already logged) → must NOT ingest again.
    rpc.mockReset();
    rpc.mockImplementation((fn: string) => {
      if (fn === "shopify_log_webhook") return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await svc.process(meta, payload);

    const replayIngestCalls = rpc.mock.calls.filter((c) => c[0] === "shopify_ingest_order").length;
    expect(replayIngestCalls).toBe(0);
  });

  it("passes the tenant business_id (never payload-derived) to both RPCs", async () => {
    const svc = new ShopifyIngestionService(tenant, silentLogger);
    rpc.mockImplementation((fn: string) => {
      if (fn === "shopify_log_webhook") return Promise.resolve({ data: true, error: null });
      if (fn === "shopify_ingest_order") return Promise.resolve({ data: "order-uuid", error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await svc.process(meta, payload);

    for (const call of rpc.mock.calls) {
      expect(call[1].p_business_id).toBe("biz-1");
    }
  });
});
