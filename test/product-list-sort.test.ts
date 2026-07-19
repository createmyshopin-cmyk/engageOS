import { describe, it, expect } from "vitest";
import { isNewProduct } from "@/server/modules/products/new-products";
import {
  compareProductRows,
  sortProductRows,
  isAfterProductCursor,
} from "@/server/modules/products/product-list-sort";

describe("product list sort", () => {
  it("sorts newest products first by created_at", () => {
    const sorted = sortProductRows(
      [
        {
          id: "a",
          created_at: "2026-06-01T00:00:00Z",
          stockTier: 0,
          price: 100,
          title: "A",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
        {
          id: "b",
          created_at: "2026-07-01T00:00:00Z",
          stockTier: 0,
          price: 100,
          title: "B",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
      ],
      "newest"
    );
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts coupon-redeemed products before others", () => {
    const sorted = sortProductRows(
      [
        {
          id: "a",
          created_at: "2026-07-01T00:00:00Z",
          stockTier: 0,
          price: 100,
          title: "A",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
        {
          id: "b",
          created_at: "2026-06-01T00:00:00Z",
          stockTier: 0,
          price: 100,
          title: "B",
          couponTier: 0,
          couponRedemptionCount: 3,
        },
      ],
      "coupon_first"
    );
    expect(sorted.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts in-stock before out-of-stock when stock_first", () => {
    expect(
      compareProductRows(
        {
          id: "a",
          created_at: "2026-07-01T00:00:00Z",
          stockTier: 2,
          price: 10,
          title: "A",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
        {
          id: "b",
          created_at: "2026-06-01T00:00:00Z",
          stockTier: 0,
          price: 10,
          title: "B",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
        "stock_first"
      )
    ).toBeGreaterThan(0);
  });

  it("marks products synced within 30 days as new", () => {
    const now = new Date("2026-07-19T00:00:00Z");
    expect(isNewProduct("2026-07-01T00:00:00Z", now)).toBe(true);
    expect(isNewProduct("2026-05-01T00:00:00Z", now)).toBe(false);
  });

  it("paginates after cursor in newest order", () => {
    const cursor = {
      sort: "newest" as const,
      k1: "2026-07-10T00:00:00Z",
      k2: "a",
      id: "a",
    };
    expect(
      isAfterProductCursor(
        {
          id: "b",
          created_at: "2026-07-01T00:00:00Z",
          stockTier: 0,
          price: 1,
          title: "B",
          couponTier: 1,
          couponRedemptionCount: 0,
        },
        cursor
      )
    ).toBe(true);
  });
});
