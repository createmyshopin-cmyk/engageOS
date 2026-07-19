import { describe, it, expect } from "vitest";
import {
  deriveStockInfo,
  inventoryItemToProductMap,
  stockFromProductRaw,
} from "@/server/modules/products/stock";

describe("product stock", () => {
  it("derives stock buckets from available quantity", () => {
    expect(deriveStockInfo(10)).toEqual({ status: "in_stock", available: 10 });
    expect(deriveStockInfo(3)).toEqual({ status: "low_stock", available: 3 });
    expect(deriveStockInfo(0)).toEqual({ status: "out_of_stock", available: 0 });
    expect(deriveStockInfo(null)).toEqual({ status: "unknown", available: null });
  });

  it("parses string inventory_quantity from variant raw payloads", () => {
    expect(
      stockFromProductRaw({
        variants: [{ inventory_quantity: "12" }, { inventory_quantity: "3" }],
      })
    ).toBe(15);
  });

  it("maps inventory_item_id to product via variant raw", () => {
    const map = inventoryItemToProductMap([
      {
        shopify_product_id: "99",
        raw: { variants: [{ inventory_item_id: 555 }] },
      },
    ]);
    expect(map.get("555")).toBe("99");
  });
});
