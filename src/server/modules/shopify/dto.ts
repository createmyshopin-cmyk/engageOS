import "server-only";

/**
 * Shopify read-model DTOs — the wire shapes for the merchant-facing Shopify
 * overview. This is a READ-ONLY window onto data the webhook ingestion pipeline
 * already landed (shopify_shops + orders + shopify_products); nothing here
 * connects a store or mutates Shopify. OAuth/connection is out of scope (D4).
 */

/** Connection + ingestion summary for a tenant's Shopify store. */
export interface ShopifyOverviewDTO {
  connected: boolean;
  shop: {
    domain: string;
    status: string;
    installedAt: string | null;
  } | null;
  totals: {
    orders: number;
    products: number;
    revenue: number;
  };
  lastOrderAt: string | null;
}

/** Row shape selected from shopify_shops (tenant-scoped). */
export interface ShopifyShopRow {
  shop_domain: string;
  status: string;
  installed_at: string | null;
}

export function toShopifyOverviewDTO(input: {
  shop: ShopifyShopRow | null;
  orders: number;
  products: number;
  revenue: number;
  lastOrderAt: string | null;
}): ShopifyOverviewDTO {
  return {
    connected: input.shop != null && input.shop.status === "active",
    shop: input.shop
      ? {
          domain: input.shop.shop_domain,
          status: input.shop.status,
          installedAt: input.shop.installed_at,
        }
      : null,
    totals: {
      orders: input.orders,
      products: input.products,
      revenue: Math.round(input.revenue * 100) / 100,
    },
    lastOrderAt: input.lastOrderAt,
  };
}
