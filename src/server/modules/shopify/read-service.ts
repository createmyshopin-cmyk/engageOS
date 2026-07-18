import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { ShopifyReadRepository } from "@/server/modules/shopify/read-repository";
import { toShopifyOverviewDTO, type ShopifyOverviewDTO } from "@/server/modules/shopify/dto";

/**
 * ShopifyReadService — assembles the merchant Shopify overview from ingested
 * data. Read-only: no OAuth, no store connection, no writes. Business logic
 * (what "connected" means, how revenue is summed) lives here; SQL stays in the
 * repository. Tenancy arrives as a constructor argument, never ambient.
 */
export class ShopifyReadService extends Service {
  private readonly repo: ShopifyReadRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new ShopifyReadRepository(tenant);
  }

  /** Connection status + ingestion totals for this tenant's store. */
  async overview(): Promise<ShopifyOverviewDTO> {
    const [shop, orders, products, rev] = await Promise.all([
      this.repo.shop(),
      this.repo.orderCount(),
      this.repo.productCount(),
      this.repo.revenueAndLastOrder(),
    ]);
    return toShopifyOverviewDTO({
      shop,
      orders,
      products,
      revenue: rev.revenue,
      lastOrderAt: rev.lastOrderAt,
    });
  }
}
