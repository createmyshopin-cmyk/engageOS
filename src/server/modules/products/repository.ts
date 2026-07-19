import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import type { ProductListRow } from "@/server/modules/products/dto";
import {
  aggregateCouponStatsByProduct,
  type CouponLineItemRow,
  type ProductCouponStats,
} from "@/server/modules/products/coupon-stats";
import {
  deriveStockInfo,
  inventoryItemToProductMap,
  stockFromProductRaw,
  stockSortTier,
  type ProductStockInfo,
} from "@/server/modules/products/stock";
import {
  buildProductListPage,
  isAfterProductCursor,
  sortProductRows,
  type ProductListCursor,
  type ProductSort,
} from "@/server/modules/products/product-list-sort";
import { isNewProduct, type ProductNewFilter } from "@/server/modules/products/new-products";

/**
 * ProductRepository — tenant-scoped catalog reads over shopify_products. The
 * list uses the auto-scoped select builder with keyset pagination over
 * (created_at, id) and an optional case-insensitive title/handle search.
 * Read-only: ingestion owns writes.
 */

const LIST_COLUMNS =
  "id, shopify_product_id, title, handle, product_type, vendor, status, price, image_url, created_at";

type EmbeddedCustomer = { name: string | null } | { name: string | null }[] | null;

interface CouponOrderItemRow {
  shopify_product_id: string | null;
  quantity: number;
  price: number | string;
  orders: {
    id: string;
    order_number: string | null;
    coupon_id: string | null;
    discount_code: string | null;
    placed_at: string;
    customer_id: string | null;
    customers: EmbeddedCustomer;
  };
}

export type ProductCouponFilter = "all" | "with_coupon" | "without_coupon";
export type ProductStockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export interface ProductListEntry extends ProductListRow {
  stock: ProductStockInfo;
  stockTier: number;
  price: number | null;
  couponTier: number;
  couponRedemptionCount: number;
  couponStats: ProductCouponStats | null;
}

export class ProductRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async list(opts: {
    limit: number;
    cursor: ProductListCursor | null;
    search: string | null;
    status: string | null;
    couponFilter: ProductCouponFilter;
    couponProductIds: string[] | null;
    stockFilter: ProductStockFilter;
    newFilter: ProductNewFilter;
    sort: ProductSort;
  }): Promise<{ items: ProductListEntry[]; page: PageInfo }> {
    const [rows, inventoryMap, couponStatsMap] = await Promise.all([
      this.fetchMatchingRows(opts),
      this.inventoryTotalsByProduct(),
      this.couponStatsForAllProducts(),
    ]);

    const missingInventoryIds = rows
      .map((r) => r.shopify_product_id)
      .filter((id) => !inventoryMap.has(id));
    const rawFallback =
      missingInventoryIds.length > 0
        ? await this.rawInventoryFallback(missingInventoryIds)
        : new Map<string, number>();

    for (const [id, qty] of rawFallback) {
      if (!inventoryMap.has(id)) inventoryMap.set(id, qty);
    }

    let enriched: ProductListEntry[] = rows.map((row) => {
      const available =
        inventoryMap.get(row.shopify_product_id) ??
        rawFallback.get(row.shopify_product_id) ??
        null;
      const stock = deriveStockInfo(available);
      const price = row.price == null ? null : Number(row.price) || 0;
      const couponStats = couponStatsMap.get(row.shopify_product_id) ?? null;
      const couponRedemptionCount = couponStats?.redemptionCount ?? 0;
      return {
        ...row,
        stock,
        stockTier: stockSortTier(stock.status),
        price,
        couponStats,
        couponRedemptionCount,
        couponTier: couponRedemptionCount > 0 ? 0 : 1,
      };
    });

    if (opts.newFilter === "new") {
      enriched = enriched.filter((row) => isNewProduct(row.created_at));
    }

    if (opts.stockFilter !== "all") {
      enriched = enriched.filter((row) => row.stock.status === opts.stockFilter);
    }

    enriched = sortProductRows(enriched, opts.sort);

    if (opts.cursor) {
      enriched = enriched.filter((row) => isAfterProductCursor(row, opts.cursor!));
    }

    return buildProductListPage(enriched, opts.limit, opts.sort);
  }

  async stockForProduct(product: ProductListRow): Promise<ProductStockInfo> {
    const inventoryMap = await this.inventoryTotalsByProduct();
    let available = inventoryMap.get(product.shopify_product_id) ?? null;
    if (available === null) {
      const fallback = await this.rawInventoryFallback([product.shopify_product_id]);
      available = fallback.get(product.shopify_product_id) ?? null;
    }
    return deriveStockInfo(available);
  }

  private async fetchMatchingRows(opts: {
    search: string | null;
    status: string | null;
    couponFilter: ProductCouponFilter;
    couponProductIds: string[] | null;
  }): Promise<ProductListRow[]> {
    let q = this.tenant.select("shopify_products", LIST_COLUMNS);

    if (opts.status) q = q.eq("status", opts.status);
    if (opts.search) {
      const term = `%${opts.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      q = q.or(`title.ilike.${term},handle.ilike.${term},vendor.ilike.${term}`);
    }

    if (opts.couponFilter === "with_coupon") {
      if (!opts.couponProductIds?.length) return [];
      q = q.in("shopify_product_id", opts.couponProductIds);
    } else if (opts.couponFilter === "without_coupon" && opts.couponProductIds?.length) {
      q = q.not("shopify_product_id", "in", `(${opts.couponProductIds.join(",")})`);
    }

    q = q.order("created_at", { ascending: false }).order("id", { ascending: false });

    const { data, error } = await q;
    if (error) throw new Error(`products.list failed: ${error.message}`);
    return (data ?? []) as unknown as ProductListRow[];
  }

  /** Sum available units per Shopify product id across all locations. */
  async inventoryTotalsByProduct(): Promise<Map<string, number>> {
    const [invResult, productResult] = await Promise.all([
      this.tenant.select(
        "shopify_inventory",
        "inventory_item_id, shopify_product_id, available"
      ),
      this.tenant.select("shopify_products", "shopify_product_id, raw"),
    ]);
    if (invResult.error) throw new Error(`products.inventory failed: ${invResult.error.message}`);
    if (productResult.error) {
      throw new Error(`products.inventoryProducts failed: ${productResult.error.message}`);
    }

    const products = (productResult.data ?? []) as unknown as Array<{
      shopify_product_id: string;
      raw: unknown;
    }>;
    const itemToProduct = inventoryItemToProductMap(products);
    const totals = new Map<string, number>();

    for (const row of (invResult.data ?? []) as unknown as Array<{
      inventory_item_id: string | null;
      shopify_product_id: string | null;
      available: number | null;
    }>) {
      const qty = Number(row.available) || 0;
      const productId =
        row.shopify_product_id?.trim() ||
        (row.inventory_item_id ? itemToProduct.get(String(row.inventory_item_id)) : undefined);
      if (!productId) continue;
      totals.set(productId, (totals.get(productId) ?? 0) + qty);
    }

    // Fallback: variant inventory_quantity on the synced product payload.
    for (const product of products) {
      if (totals.has(product.shopify_product_id)) continue;
      const qty = stockFromProductRaw(product.raw);
      if (qty !== null) totals.set(product.shopify_product_id, qty);
    }

    return totals;
  }

  private async rawInventoryFallback(
    shopifyProductIds: string[]
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (shopifyProductIds.length === 0) return result;

    const { data, error } = await this.tenant
      .select("shopify_products", "shopify_product_id, raw")
      .in("shopify_product_id", shopifyProductIds);
    if (error) throw new Error(`products.rawInventory failed: ${error.message}`);

    for (const row of (data ?? []) as unknown as Array<{
      shopify_product_id: string;
      raw: unknown;
    }>) {
      const qty = stockFromProductRaw(row.raw);
      if (qty !== null) result.set(row.shopify_product_id, qty);
    }
    return result;
  }

  async countProducts(): Promise<number> {
    return this.tenant.count("shopify_products");
  }

  /** Distinct Shopify product ids that appear on coupon-attributed orders. */
  async shopifyProductIdsWithCouponRedemptions(): Promise<string[]> {
    const rows = await this.fetchCouponLineItems();
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.shopifyProductId) ids.add(row.shopifyProductId);
    }
    return Array.from(ids);
  }

  async couponStatsForShopifyProductIds(
    shopifyProductIds: string[]
  ): Promise<Map<string, ProductCouponStats>> {
    if (shopifyProductIds.length === 0) return new Map();
    const all = await this.fetchCouponLineItems();
    const filtered = all.filter((row) => shopifyProductIds.includes(row.shopifyProductId));
    return aggregateCouponStatsByProduct(filtered);
  }

  /** Full-tenant coupon stats map (used for coupon-first catalog sorting). */
  async couponStatsForAllProducts(): Promise<Map<string, ProductCouponStats>> {
    const all = await this.fetchCouponLineItems();
    return aggregateCouponStatsByProduct(all);
  }

  async couponStatsForProduct(productId: string): Promise<{
    product: ProductListRow | null;
    stock: ProductStockInfo;
    stats: ProductCouponStats | null;
    redemptions: CouponLineItemRow[];
  }> {
    const { data, error } = await this.tenant
      .select("shopify_products", LIST_COLUMNS)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw new Error(`products.get failed: ${error.message}`);
    const product = (data as unknown as ProductListRow | null) ?? null;
    if (!product) {
      return { product: null, stock: deriveStockInfo(null), stats: null, redemptions: [] };
    }

    const stock = await this.stockForProduct(product);
    const all = await this.fetchCouponLineItems();
    const rows = all.filter((row) => row.shopifyProductId === product.shopify_product_id);
    const statsMap = aggregateCouponStatsByProduct(rows);
    const stats = statsMap.get(product.shopify_product_id) ?? null;
    return {
      product,
      stock,
      stats,
      redemptions: rows.sort((a, b) => b.placedAt.localeCompare(a.placedAt)),
    };
  }

  async couponSummary(): Promise<{
    totalProducts: number;
    productsWithCoupons: number;
    totalCouponOrders: number;
    totalCustomers: number;
  }> {
    const [totalProducts, couponOrders] = await Promise.all([
      this.countProducts(),
      this.fetchCouponOrders(),
    ]);

    const productIds = new Set<string>();
    const customerIds = new Set<string>();
    for (const row of couponOrders) {
      for (const item of row.order_items ?? []) {
        if (item.shopify_product_id) productIds.add(item.shopify_product_id);
      }
      if (row.customer_id) customerIds.add(row.customer_id);
    }

    return {
      totalProducts,
      productsWithCoupons: productIds.size,
      totalCouponOrders: couponOrders.length,
      totalCustomers: customerIds.size,
    };
  }

  private async fetchCouponOrders(): Promise<
    Array<{
      id: string;
      customer_id: string | null;
      order_items: Array<{ shopify_product_id: string | null }> | null;
    }>
  > {
    const { data, error } = await this.tenant
      .select("orders", "id, customer_id, order_items(shopify_product_id)")
      .not("coupon_id", "is", null);
    if (error) throw new Error(`products.couponOrders failed: ${error.message}`);
    return (data ?? []) as unknown as Array<{
      id: string;
      customer_id: string | null;
      order_items: Array<{ shopify_product_id: string | null }> | null;
    }>;
  }

  private async fetchCouponLineItems(): Promise<CouponLineItemRow[]> {
    const { data, error } = await this.tenant
      .select(
        "order_items",
        "shopify_product_id, quantity, price, orders!inner(id, order_number, coupon_id, discount_code, placed_at, customer_id, customers(name))"
      )
      .not("orders.coupon_id", "is", null);
    if (error) throw new Error(`products.couponLineItems failed: ${error.message}`);

    const rows = (data ?? []) as unknown as CouponOrderItemRow[];
    return rows
      .map((row) => {
        const order = row.orders;
        const customer = order.customers;
        const customerName = Array.isArray(customer)
          ? customer[0]?.name ?? null
          : customer?.name ?? null;
        return {
          shopifyProductId: row.shopify_product_id ?? "",
          quantity: row.quantity ?? 1,
          price: Number(row.price) || 0,
          orderId: order.id,
          orderNumber: order.order_number,
          discountCode: order.discount_code,
          placedAt: order.placed_at,
          customerId: order.customer_id,
          customerName,
        } satisfies CouponLineItemRow;
      })
      .filter((row) => row.shopifyProductId);
  }
}
