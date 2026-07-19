import "server-only";
import type {
  ProductCouponRedemption,
  ProductCouponStats,
} from "@/server/modules/products/coupon-stats";
import type { ProductStockInfo, ProductStockStatus } from "@/server/modules/products/stock";
import { isNewProduct } from "@/server/modules/products/new-products";

/**
 * Product DTOs — the wire shapes for the merchant products read model. The
 * `raw` jsonb and Shopify-internal ids stay server-side; the list is a light
 * catalog projection.
 */

export type ProductCouponRedemptionDTO = ProductCouponRedemption;
export type ProductCouponStatsDTO = ProductCouponStats;
export type ProductStockStatusDTO = ProductStockStatus;
export type ProductStockDTO = ProductStockInfo;

export interface ProductListItemDTO {
  id: string;
  title: string | null;
  handle: string | null;
  productType: string | null;
  vendor: string | null;
  status: string | null;
  price: number | null;
  imageUrl: string | null;
  createdAt: string;
  /** True when the product was synced in the last 30 days. */
  isNew: boolean;
  stock: ProductStockDTO;
  /** Null when no EngageOS coupon has been redeemed on this product. */
  couponStats: ProductCouponStatsDTO | null;
}

export interface ProductCouponSummaryDTO {
  totalProducts: number;
  productsWithCoupons: number;
  totalCouponOrders: number;
  totalCustomers: number;
}

/** Row shape selected from shopify_products (tenant-scoped). */
export interface ProductListRow {
  id: string;
  shopify_product_id: string;
  title: string | null;
  handle: string | null;
  product_type: string | null;
  vendor: string | null;
  status: string | null;
  price: number | string | null;
  image_url: string | null;
  created_at: string;
}

export function toProductListItemDTO(
  row: ProductListRow,
  stock: ProductStockInfo,
  couponStats: ProductCouponStatsDTO | null = null
): ProductListItemDTO {
  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    productType: row.product_type,
    vendor: row.vendor,
    status: row.status,
    price: row.price == null ? null : Number(row.price) || 0,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    isNew: isNewProduct(row.created_at),
    stock,
    couponStats,
  };
}
