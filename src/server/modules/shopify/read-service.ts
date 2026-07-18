import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { ShopifyReadRepository } from "@/server/modules/shopify/read-repository";
import { toShopifyOverviewDTO, type ShopifyOverviewDTO } from "@/server/modules/shopify/dto";
import { getShopifyForBusiness, refreshShopifyScopes } from "@/lib/shopify/adapter";
import type { CouponDropOverviewRow, CouponDropSampleCode } from "@/lib/types";

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

  /**
   * Live granted Admin API scopes, read from Shopify (access_scopes.json). Falls
   * back to the scopes stored at connect time when the live call fails or the
   * store isn't connected. The access token stays server-side; only the scope
   * handle strings are returned.
   */
  async scopes(): Promise<{ granted: string[]; live: boolean }> {
    const shopify = await getShopifyForBusiness(this.businessId);
    if (shopify) {
      try {
        const live = await shopify.client.getAccessScopes();
        return { granted: splitScopes(live), live: true };
      } catch {
        return { granted: splitScopes(shopify.shop.scopes), live: false };
      }
    }
    const shop = await this.repo.shop();
    return { granted: splitScopes(shop?.scopes ?? null), live: false };
  }

  /**
   * Force-refresh the granted scopes by re-exchanging the Shopify token, so a
   * scope the merchant enabled AFTER connecting is picked up without waiting for
   * the 24h token to expire. Returns the reconciled scope set (live:true when the
   * exchange + read succeeded). No-op shape when not connected.
   */
  async refreshScopes(): Promise<{ granted: string[]; live: boolean }> {
    const refreshed = await refreshShopifyScopes(this.businessId);
    if (refreshed !== null) return { granted: splitScopes(refreshed), live: true };
    // Couldn't refresh (not connected / no credentials) → fall back to stored.
    return this.scopes();
  }

  /**
   * Per-campaign Coupon Drop overview + a few sample codes per campaign, so the
   * merchant can see what was minted in Shopify and inspect real code values.
   */
  async couponDrops(sampleLimit = 5): Promise<    Array<CouponDropOverviewRow & { sample_codes: CouponDropSampleCode[] }>
  > {
    const rows = await this.repo.couponDropOverview();
    const withSamples = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        sample_codes:
          row.codes_minted > 0
            ? await this.repo.couponDropSampleCodes(row.campaign_id, sampleLimit)
            : [],
      }))
    );
    return withSamples;
  }
}

/** Split a Shopify scope string into trimmed, non-empty handles. */
function splitScopes(scopes: string | null | undefined): string[] {
  if (!scopes) return [];
  return scopes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
