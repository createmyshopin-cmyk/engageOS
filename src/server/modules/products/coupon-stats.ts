import "server-only";

/**
 * Pure aggregation for coupon redemption stats per Shopify product id.
 * Keeps SQL thin and makes the rollup rules unit-testable.
 */

export interface CouponLineItemRow {
  shopifyProductId: string;
  quantity: number;
  price: number;
  orderId: string;
  orderNumber: string | null;
  discountCode: string | null;
  placedAt: string;
  customerId: string | null;
  customerName: string | null;
}

export interface ProductCouponRedemption {
  orderId: string;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  discountCode: string | null;
  placedAt: string;
  quantity: number;
  lineTotal: number;
}

export interface ProductCouponStats {
  redemptionCount: number;
  customerCount: number;
  quantitySold: number;
  revenue: number;
  lastRedeemedAt: string | null;
  latestDiscountCode: string | null;
  latestCustomerName: string | null;
  recentRedemptions: ProductCouponRedemption[];
}

type MutableStats = ProductCouponStats & {
  orderIds: Set<string>;
  customerIds: Set<string>;
  allRedemptions: ProductCouponRedemption[];
};

function emptyStats(): MutableStats {
  return {
    redemptionCount: 0,
    customerCount: 0,
    quantitySold: 0,
    revenue: 0,
    lastRedeemedAt: null,
    latestDiscountCode: null,
    latestCustomerName: null,
    recentRedemptions: [],
    orderIds: new Set(),
    customerIds: new Set(),
    allRedemptions: [],
  };
}

/** Roll up line items into per-product coupon stats (keyed by shopify_product_id). */
export function aggregateCouponStatsByProduct(
  rows: CouponLineItemRow[]
): Map<string, ProductCouponStats> {
  const byProduct = new Map<string, MutableStats>();

  for (const row of rows) {
    if (!row.shopifyProductId) continue;
    let stats = byProduct.get(row.shopifyProductId);
    if (!stats) {
      stats = emptyStats();
      byProduct.set(row.shopifyProductId, stats);
    }

    const lineTotal = row.price * row.quantity;
    stats.quantitySold += row.quantity;
    stats.revenue += lineTotal;
    stats.orderIds.add(row.orderId);
    if (row.customerId) stats.customerIds.add(row.customerId);

    const redemption: ProductCouponRedemption = {
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      discountCode: row.discountCode,
      placedAt: row.placedAt,
      quantity: row.quantity,
      lineTotal,
    };
    stats.allRedemptions.push(redemption);

    if (!stats.lastRedeemedAt || row.placedAt > stats.lastRedeemedAt) {
      stats.lastRedeemedAt = row.placedAt;
      stats.latestDiscountCode = row.discountCode;
      stats.latestCustomerName = row.customerName;
    }
  }

  const result = new Map<string, ProductCouponStats>();
  for (const [productId, stats] of byProduct) {
    stats.allRedemptions.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    result.set(productId, {
      redemptionCount: stats.orderIds.size,
      customerCount: stats.customerIds.size,
      quantitySold: stats.quantitySold,
      revenue: Math.round(stats.revenue * 100) / 100,
      lastRedeemedAt: stats.lastRedeemedAt,
      latestDiscountCode: stats.latestDiscountCode,
      latestCustomerName: stats.latestCustomerName,
      recentRedemptions: stats.allRedemptions.slice(0, 3),
    });
  }
  return result;
}
