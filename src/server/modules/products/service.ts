import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import {
  ProductRepository,
  type ProductCouponFilter,
  type ProductStockFilter,
} from "@/server/modules/products/repository";
import {
  toProductListItemDTO,
  type ProductCouponSummaryDTO,
  type ProductListItemDTO,
} from "@/server/modules/products/dto";
import type { ProductCouponRedemption } from "@/server/modules/products/coupon-stats";
import type { ProductListCursor, ProductSort } from "@/server/modules/products/product-list-sort";
import type { ProductNewFilter } from "@/server/modules/products/new-products";

/**
 * ProductService — read-only catalog business logic. Fetches one keyset page
 * and maps rows to the wire DTO. No SQL, no HTTP; tenancy arrives as an argument.
 */
export class ProductService extends Service {
  private readonly repo: ProductRepository;
  private couponProductIdsCache: string[] | null | undefined;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new ProductRepository(tenant);
  }

  async list(opts: {
    limit: number;
    cursor: ProductListCursor | null;
    search: string | null;
    status: string | null;
    couponFilter: ProductCouponFilter;
    stockFilter: ProductStockFilter;
    newFilter: ProductNewFilter;
    sort: ProductSort;
  }): Promise<{ items: ProductListItemDTO[]; page: PageInfo }> {
    const couponProductIds = await this.couponProductIds();
    const { items, page } = await this.repo.list({
      ...opts,
      couponProductIds,
    });

    return {
      items: items.map((row) =>
        toProductListItemDTO(row, row.stock, row.couponStats)
      ),
      page,
    };
  }

  async couponSummary(): Promise<ProductCouponSummaryDTO> {
    return this.repo.couponSummary();
  }

  async couponRedemptions(productId: string): Promise<{
    product: ProductListItemDTO | null;
    redemptions: ProductCouponRedemption[];
  }> {
    const { product, stock, stats, redemptions } = await this.repo.couponStatsForProduct(productId);
    if (!product) return { product: null, redemptions: [] };
    return {
      product: toProductListItemDTO(product, stock, stats),
      redemptions: redemptions.map((r) => ({
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        customerId: r.customerId,
        customerName: r.customerName,
        discountCode: r.discountCode,
        placedAt: r.placedAt,
        quantity: r.quantity,
        lineTotal: Math.round(r.price * r.quantity * 100) / 100,
      })),
    };
  }

  private async couponProductIds(): Promise<string[] | null> {
    if (this.couponProductIdsCache !== undefined) return this.couponProductIdsCache;
    this.couponProductIdsCache = await this.repo.shopifyProductIdsWithCouponRedemptions();
    return this.couponProductIdsCache;
  }
}