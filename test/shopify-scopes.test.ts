import { describe, it, expect } from "vitest";
import {
  parseScopes,
  expandImpliedScopes,
  isScopeGranted,
} from "@/lib/shopify/scopes";

describe("parseScopes", () => {
  it("splits, trims, and drops empties", () => {
    expect([...parseScopes(" read_orders, write_discounts ,")]).toEqual([
      "read_orders",
      "write_discounts",
    ]);
  });

  it("returns an empty set for null/undefined/empty", () => {
    expect(parseScopes(null).size).toBe(0);
    expect(parseScopes(undefined).size).toBe(0);
    expect(parseScopes("").size).toBe(0);
  });
});

describe("expandImpliedScopes (write implies read)", () => {
  it("adds read_x for every write_x present", () => {
    const out = expandImpliedScopes(new Set(["write_discounts"]));
    expect(out.has("write_discounts")).toBe(true);
    expect(out.has("read_discounts")).toBe(true);
  });

  it("leaves plain read scopes untouched", () => {
    const out = expandImpliedScopes(new Set(["read_products"]));
    expect([...out]).toEqual(["read_products"]);
  });

  it("does not fabricate writes from reads", () => {
    const out = expandImpliedScopes(new Set(["read_discounts"]));
    expect(out.has("write_discounts")).toBe(false);
  });
});

describe("isScopeGranted", () => {
  it("treats write_discounts as granting read_discounts (Shopify implied read)", () => {
    // This is the exact bug: Shopify's access_scopes.json returns only
    // write_discounts, so an exact-string check wrongly flags read_discounts.
    expect(isScopeGranted("read_discounts", "write_discounts")).toBe(true);
    expect(isScopeGranted("write_discounts", "write_discounts")).toBe(true);
  });

  it("accepts a raw string or a pre-parsed set", () => {
    expect(isScopeGranted("read_orders", "read_orders,read_products")).toBe(true);
    expect(isScopeGranted("read_orders", new Set(["read_orders"]))).toBe(true);
  });

  it("returns false when the scope is genuinely absent", () => {
    expect(isScopeGranted("write_discounts", "read_products,read_orders")).toBe(false);
    expect(isScopeGranted("write_discounts", null)).toBe(false);
  });
});
