import { describe, it, expect } from "vitest";
import { toShopifyOverviewDTO, type ShopifyShopRow } from "@/server/modules/shopify/dto";
import { toOrderListItemDTO, type OrderListRow } from "@/server/modules/orders/dto";
import { toProductListItemDTO } from "@/server/modules/products/dto";

/**
 * Phase 4 (Shopify read-only) — pure transformer logic for the overview
 * endpoint. The aggregation (counts, revenue sum) runs against the live DB;
 * these tests pin the app-tier rules: connection semantics, revenue rounding,
 * and the null-store shape.
 */

describe("shopify overview DTO", () => {
  const shop: ShopifyShopRow = {
    shop_domain: "acme.myshopify.com",
    status: "active",
    installed_at: "2026-06-01T00:00:00Z",
    scopes: "read_orders,read_products,write_discounts",
  };

  it("maps an active store to connected=true with rounded revenue", () => {
    const dto = toShopifyOverviewDTO({
      shop,
      orders: 12,
      products: 40,
      revenue: 1999.999,
      lastOrderAt: "2026-07-10T00:00:00Z",
    });
    expect(dto.connected).toBe(true);
    expect(dto.shop).toEqual({
      domain: "acme.myshopify.com",
      status: "active",
      installedAt: "2026-06-01T00:00:00Z",
      scopes: "read_orders,read_products,write_discounts",
    });
    expect(dto.totals).toEqual({ orders: 12, products: 40, revenue: 2000 });
    expect(dto.lastOrderAt).toBe("2026-07-10T00:00:00Z");
  });

  it("treats a paused store as not connected but still reports the shop", () => {
    const dto = toShopifyOverviewDTO({
      shop: { ...shop, status: "paused" },
      orders: 3,
      products: 5,
      revenue: 100,
      lastOrderAt: null,
    });
    expect(dto.connected).toBe(false);
    expect(dto.shop?.status).toBe("paused");
  });

  it("returns a null shop and zero totals when no store is connected", () => {
    const dto = toShopifyOverviewDTO({
      shop: null,
      orders: 0,
      products: 0,
      revenue: 0,
      lastOrderAt: null,
    });
    expect(dto.connected).toBe(false);
    expect(dto.shop).toBeNull();
    expect(dto.totals).toEqual({ orders: 0, products: 0, revenue: 0 });
  });
});

describe("order list item DTO", () => {
  const base: OrderListRow = {
    id: "o1",
    order_number: "1001",
    source: "shopify",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    currency: "INR",
    total_price: "1499.50",
    customer_id: "cust-1",
    customer_phone: "+919999999999",
    placed_at: "2026-07-10T00:00:00Z",
    customers: { name: "Asha" },
  };

  it("maps snake_case columns to the camelCase wire shape and coerces total", () => {
    const dto = toOrderListItemDTO(base);
    expect(dto).toEqual({
      id: "o1",
      orderNumber: "1001",
      source: "shopify",
      financialStatus: "paid",
      fulfillmentStatus: "fulfilled",
      currency: "INR",
      totalPrice: 1499.5,
      customerId: "cust-1",
      customerName: "Asha",
      customerPhone: "+919999999999",
      placedAt: "2026-07-10T00:00:00Z",
    });
  });

  it("normalizes an embedded customer returned as an array", () => {
    const dto = toOrderListItemDTO({ ...base, customers: [{ name: "Ravi" }] });
    expect(dto.customerName).toBe("Ravi");
  });

  it("handles a guest order (null customer + null total)", () => {
    const dto = toOrderListItemDTO({
      ...base,
      customer_id: null,
      customer_phone: null,
      customers: null,
      total_price: null,
    });
    expect(dto.customerId).toBeNull();
    expect(dto.customerName).toBeNull();
    expect(dto.totalPrice).toBe(0);
  });
});

describe("product list item DTO", () => {
  it("maps snake_case columns and coerces a numeric-string price", () => {
    const dto = toProductListItemDTO({
      id: "p1",
      title: "Onam Sadya Kit",
      handle: "onam-sadya-kit",
      product_type: "Food",
      vendor: "Acme",
      status: "active",
      price: "899.00",
      image_url: "https://cdn/x.png",
      created_at: "2026-06-01T00:00:00Z",
    });
    expect(dto).toEqual({
      id: "p1",
      title: "Onam Sadya Kit",
      handle: "onam-sadya-kit",
      productType: "Food",
      vendor: "Acme",
      status: "active",
      price: 899,
      imageUrl: "https://cdn/x.png",
      createdAt: "2026-06-01T00:00:00Z",
    });
  });

  it("preserves a null price (distinct from 0)", () => {
    const dto = toProductListItemDTO({
      id: "p2",
      title: null,
      handle: null,
      product_type: null,
      vendor: null,
      status: null,
      price: null,
      image_url: null,
      created_at: "2026-06-01T00:00:00Z",
    });
    expect(dto.price).toBeNull();
  });
});
