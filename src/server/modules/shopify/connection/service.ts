import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { disconnectShopify } from "@/lib/shopify/adapter";

/**
 * ShopifyConnectionService — store-connection lifecycle for the merchant surface.
 *
 * Today this covers manual disconnect. It delegates to the Shopify adapter
 * facade (the integration-layer equivalent of a repository — service-role,
 * business_id-scoped persistence kept OUT of TenantRepository, exactly like the
 * wacrm integration). The token is dropped server-side; nothing sensitive is
 * ever returned to the caller.
 *
 * Reconnection is not an action here — a merchant reconnects by re-running the
 * OAuth install flow (`/api/shopify/install`), which re-issues a fresh token.
 */
export class ShopifyConnectionService extends Service {
  constructor(ctx: RequestContext, businessId: string, _tenant: TenantRepository) {
    super(ctx, businessId);
  }

  /**
   * Disconnect the tenant's store: revoke + drop the encrypted token row.
   * Idempotent — disconnecting an already-disconnected store is a no-op.
   */
  async disconnect(): Promise<{ disconnected: true }> {
    await disconnectShopify(this.businessId);
    this.logger.info("shopify.connection.disconnected", { businessId: this.businessId });
    return { disconnected: true };
  }
}
