import { describe, it, expect } from "vitest";
import { aggregateCouponStatsByProduct } from "@/server/modules/products/coupon-stats";

describe("aggregateCouponStatsByProduct", () => {
  it("rolls up line items per product with distinct order and customer counts", () => {
    const stats = aggregateCouponStatsByProduct([
      {
        shopifyProductId: "101",
        quantity: 2,
        price: 500,
        orderId: "o1",
        orderNumber: "#1001",
        discountCode: "SAVE20",
        placedAt: "2026-07-01T10:00:00Z",
        customerId: "c1",
        customerName: "Asha",
      },
      {
        shopifyProductId: "101",
        quantity: 1,
        price: 500,
        orderId: "o2",
        orderNumber: "#1002",
        discountCode: "WIN50",
        placedAt: "2026-07-10T10:00:00Z",
        customerId: "c2",
        customerName: "Ravi",
      },
      {
        shopifyProductId: "202",
        quantity: 1,
        price: 200,
        orderId: "o2",
        orderNumber: "#1002",
        discountCode: "WIN50",
        placedAt: "2026-07-10T10:00:00Z",
        customerId: "c2",
        customerName: "Ravi",
      },
    ]);

    const p101 = stats.get("101");
    expect(p101?.redemptionCount).toBe(2);
    expect(p101?.customerCount).toBe(2);
    expect(p101?.quantitySold).toBe(3);
    expect(p101?.revenue).toBe(1500);
    expect(p101?.latestDiscountCode).toBe("WIN50");
    expect(p101?.latestCustomerName).toBe("Ravi");
    expect(p101?.recentRedemptions).toHaveLength(2);

    const p202 = stats.get("202");
    expect(p202?.redemptionCount).toBe(1);
    expect(p202?.revenue).toBe(200);
  });

  it("skips rows with empty product ids", () => {
    const stats = aggregateCouponStatsByProduct([
      {
        shopifyProductId: "",
        quantity: 1,
        price: 100,
        orderId: "o1",
        orderNumber: null,
        discountCode: "X",
        placedAt: "2026-07-01T10:00:00Z",
        customerId: null,
        customerName: null,
      },
    ]);
    expect(stats.size).toBe(0);
  });
});
