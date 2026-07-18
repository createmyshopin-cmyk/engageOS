import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { connectWithCredentials, disconnectShopify } from "@/lib/shopify/adapter";
import { createSyncJob } from "@/lib/shopify/store";
import { SYNC_RESOURCES } from "@/lib/shopify/types";

/**
 * ShopifyConnectionService — store-connection lifecycle for the merchant surface.
 *
 * Connection uses the DEV DASHBOARD model (multi-tenant): the merchant builds an
 * app in Shopify's Dev Dashboard inside their own org and supplies its Client ID
 * + Client Secret. There is no global OAuth app. The service delegates to the
 * Shopify adapter facade (the integration-layer equivalent of a repository —
 * service-role, business_id-scoped persistence kept OUT of TenantRepository,
 * exactly like the wacrm/wati integrations). Secrets are validated + encrypted
 * server-side; nothing sensitive is ever returned to the caller.
 */
export class ShopifyConnectionService extends Service {
  constructor(ctx: RequestContext, businessId: string, _tenant: TenantRepository) {
    super(ctx, businessId);
  }

  /**
   * Connect the tenant's store from merchant-supplied Dev Dashboard credentials.
   * The adapter exchanges the Client ID/Secret for a short-lived token and
   * validates it against the live Shopify API before persisting (encrypted),
   * then registers webhooks. On success we enqueue an initial sync per resource
   * so the store starts filling in immediately. The tenant is the authenticated
   * session, never input.
   */
  async connect(input: {
    shopDomain: string;
    clientId: string;
    clientSecret: string;
  }): Promise<{ connected: true; shopDomain: string; shopName: string }> {
    const result = await connectWithCredentials(
      this.businessId,
      input.shopDomain,
      input.clientId,
      input.clientSecret
    );

    // Kick off an initial sync for every resource (best-effort — a failure here
    // must not fail the connect; the scheduler will pick it up on the next tick).
    try {
      for (const resource of SYNC_RESOURCES) {
        await createSyncJob(this.businessId, resource, { mode: "initial", triggeredBy: "system" });
      }
    } catch (err) {
      this.logger.warn("shopify.connection.initial_enqueue_failed", {
        businessId: this.businessId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    this.logger.info("shopify.connection.connected", {
      businessId: this.businessId,
      shopDomain: input.shopDomain,
      webhooks: result.webhooksRegistered,
    });
    return {
      connected: true,
      shopDomain: input.shopDomain.trim().toLowerCase(),
      shopName: result.shopName,
    };
  }

  /**
   * Disconnect the tenant's store: revoke + drop the encrypted token.
   * Idempotent — disconnecting an already-disconnected store is a no-op.
   */
  async disconnect(): Promise<{ disconnected: true }> {
    await disconnectShopify(this.businessId);
    this.logger.info("shopify.connection.disconnected", { businessId: this.businessId });
    return { disconnected: true };
  }
}
