import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { ShopifyShopRow } from "@/server/modules/shopify/dto";
import type { CouponDropOverviewRow } from "@/lib/types";

/**
 * ShopifyReadRepository — tenant-scoped reads for the merchant Shopify overview.
 *
 * All access goes through the bound TenantRepository, so every query is
 * physically confined to the session's business_id. This repository is
 * READ-ONLY: it never writes to shopify_* tables (ingestion owns writes) and
 * never touches encrypted token columns — it selects only display-safe fields.
 */
export class ShopifyReadRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /** The connected store row (display-safe columns only), or null. */
  async shop(): Promise<ShopifyShopRow | null> {
    const { data, error } = await this.tenant
      .select("shopify_shops", "shop_domain, status, installed_at, scopes")
      .maybeSingle();
    if (error) throw new Error(`shopify.shop failed: ${error.message}`);
    return (data as unknown as ShopifyShopRow | null) ?? null;
  }

  /** Per-campaign Coupon Drop pool overview (tenant-scoped). */
  async couponDropOverview(): Promise<CouponDropOverviewRow[]> {
    return this.tenant.couponDropOverview();
  }

  /** A few recent pool codes for one campaign (tenant-scoped). */
  async couponDropSampleCodes(campaignId: string, limit: number) {
    return this.tenant.couponDropSampleCodes(campaignId, limit);
  }

  /** Total ingested order count for the tenant. */
  async orderCount(): Promise<number> {
    return this.tenant.count("orders");
  }

  /** Total ingested product count for the tenant. */
  async productCount(): Promise<number> {
    return this.tenant.count("shopify_products");
  }

  /** Sum of order totals + the most recent placed_at, in one pass. */
  async revenueAndLastOrder(): Promise<{ revenue: number; lastOrderAt: string | null }> {
    // Small result set per tenant; summed in-app to avoid a bespoke RPC. The
    // select is tenant-scoped by business_id automatically.
    const { data, error } = await this.tenant
      .select("orders", "total_price, placed_at")
      .order("placed_at", { ascending: false });
    if (error) throw new Error(`shopify.revenue failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<{ total_price: number | string | null; placed_at: string | null }>;
    let revenue = 0;
    for (const r of rows) revenue += Number(r.total_price) || 0;
    const lastOrderAt = rows.length ? rows[0]!.placed_at : null;
    return { revenue, lastOrderAt };
  }
}
