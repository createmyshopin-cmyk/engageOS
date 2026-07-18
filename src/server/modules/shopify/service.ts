import "server-only";
import { adminClient } from "@/lib/db/rpc";
import type { Logger } from "@/server/observability/logger";
import type { ShopifyTenant } from "@/server/modules/shopify/webhook-security";
import { normalizeShopifyOrder } from "@/server/modules/shopify/normalizer";
import {
  normalizeCollection,
  normalizeCustomer,
  normalizeDiscount,
  normalizeInventoryLevel,
  normalizeProduct,
} from "@/lib/shopify/normalizers";
import {
  upsertCollection,
  upsertCustomer,
  upsertDiscount,
  upsertInventory,
  upsertProduct,
} from "@/lib/shopify/store";
import { markUninstalled } from "@/lib/shopify/adapter";

/**
 * Shopify ingestion service — the business logic behind the webhook.
 *
 * Runs AFTER the route has verified HMAC and returned 200 (via `after()`), so a
 * slow ingest never causes Shopify to retry. Idempotency is enforced in two
 * layers:
 *   1. `shopify_log_webhook` claims the X-Shopify-Webhook-Id — a redelivery
 *      returns false and we stop, so the same webhook never processes twice.
 *   2. Each upsert lands on a tenant-scoped external-id key (orders also dedup
 *      the universal event on `shopify:order:<id>`) — so even a distinct webhook
 *      id for the same entity can't double-count.
 *
 * This service uses the service-role client directly (there is no merchant
 * session on a webhook); the business_id comes from the HMAC-verified tenant,
 * never from the payload.
 */

export interface WebhookMeta {
  webhookId: string;
  topic: string;
}

export class ShopifyIngestionService {
  constructor(
    private readonly tenant: ShopifyTenant,
    private readonly logger: Logger
  ) {}

  /**
   * Process one verified webhook. Claims idempotency, then dispatches by topic.
   * Never throws to the caller — failures are logged and marked on the log row
   * so a retry can be handled without crashing the (already-flushed) response.
   */
  async process(meta: WebhookMeta, payload: unknown): Promise<void> {
    const supabase = adminClient();
    const log = this.logger.child({ topic: meta.topic, webhookId: meta.webhookId });

    // 1. Idempotency claim.
    const { data: fresh, error: claimErr } = await supabase.rpc("shopify_log_webhook", {
      p_business_id: this.tenant.businessId,
      p_webhook_id: meta.webhookId,
      p_topic: meta.topic,
      p_shop_domain: this.tenant.shopDomain,
      p_payload: payload ?? {},
    });
    if (claimErr) {
      log.error("shopify.webhook.claim_failed", { err: claimErr.message });
      return;
    }
    if (fresh === false) {
      log.info("shopify.webhook.duplicate_ignored");
      return;
    }

    // 2. Dispatch by topic.
    try {
      switch (meta.topic) {
        case "orders/create":
        case "orders/updated":
        case "orders/paid":
          await this.ingestOrder(payload);
          break;
        case "customers/create":
        case "customers/update":
          await upsertCustomer(this.tenant.businessId, normalizeCustomer(payload as Record<string, unknown>));
          break;
        case "products/create":
        case "products/update":
          await upsertProduct(this.tenant.businessId, normalizeProduct(payload as Record<string, unknown>));
          break;
        case "products/delete":
          await this.deleteProduct(payload);
          break;
        case "collections/create":
        case "collections/update":
          await upsertCollection(this.tenant.businessId, normalizeCollection(payload as Record<string, unknown>));
          break;
        case "inventory_levels/update":
          await upsertInventory(this.tenant.businessId, normalizeInventoryLevel(payload as Record<string, unknown>));
          break;
        case "discounts/create":
        case "discounts/update":
          await upsertDiscount(this.tenant.businessId, normalizeDiscount(payload as Record<string, unknown>));
          break;
        case "app/uninstalled":
          // The token is already dead. Revoke the shop so no further sync runs
          // and inbound webhooks stop resolving (status must be 'active').
          await markUninstalled(this.tenant.businessId);
          break;
        default:
          // Logged for visibility; unhandled topics are still idempotently
          // recorded so we can backfill handlers later without data loss.
          log.info("shopify.webhook.unhandled_topic");
      }
      await this.markProcessed(meta);
    } catch (err) {
      log.error("shopify.webhook.process_failed", { err });
      await this.markFailed(meta, err);
    }
  }

  private async ingestOrder(payload: unknown): Promise<void> {
    const normalized = normalizeShopifyOrder(payload);
    const { error } = await adminClient().rpc("shopify_ingest_order", {
      p_business_id: this.tenant.businessId,
      p_order: normalized,
    });
    if (error) throw new Error(`shopify_ingest_order failed: ${error.message}`);
    this.logger.info("shopify.order.ingested", {
      shopifyOrderId: normalized.shopify_order_id,
      total: normalized.total_price,
    });
  }

  /** Soft-remove a product from the mirror on products/delete. */
  private async deleteProduct(payload: unknown): Promise<void> {
    const id = (payload as { id?: number | string } | null)?.id;
    if (id == null) return;
    await adminClient()
      .from("shopify_products")
      .delete()
      .eq("business_id", this.tenant.businessId)
      .eq("shopify_product_id", String(id));
  }

  private async markProcessed(meta: WebhookMeta): Promise<void> {
    await adminClient()
      .from("shopify_webhook_log")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("business_id", this.tenant.businessId)
      .eq("webhook_id", meta.webhookId)
      .eq("topic", meta.topic);
  }

  private async markFailed(meta: WebhookMeta, err: unknown): Promise<void> {
    await adminClient()
      .from("shopify_webhook_log")
      .update({ status: "failed", error: String(err instanceof Error ? err.message : err).slice(0, 500) })
      .eq("business_id", this.tenant.businessId)
      .eq("webhook_id", meta.webhookId)
      .eq("topic", meta.topic);
  }
}
