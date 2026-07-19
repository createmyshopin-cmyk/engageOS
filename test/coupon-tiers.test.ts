import { describe, it, expect } from "vitest";
import {
  resolveTiers,
  buildParentDiscountTitle,
  type RawCouponPrize,
} from "@/lib/shopify/coupon-drop-orchestrator";

/** A raw prize row with sensible defaults, overridable per test. */
function row(overrides: Partial<RawCouponPrize> = {}): RawCouponPrize {
  return {
    id: "prize-1",
    name: "10% OFF",
    discount_type: "percentage",
    discount_value: 10,
    total_quantity: 100,
    shopify_parent_discount_id: null,
    ...overrides,
  };
}

const NO_FALLBACK = { discount_type: null, discount_value: null } as const;

describe("resolveTiers", () => {
  it("keeps a tier with its own discount and passes through identity fields", () => {
    const tiers = resolveTiers(
      [row({ id: "p5", name: "5% OFF", discount_value: 5 })],
      NO_FALLBACK
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0]).toMatchObject({
      prize_id: "p5",
      name: "5% OFF",
      discount_type: "percentage",
      discount_value: 5,
      total_quantity: 100,
    });
  });

  it("does NOT let one tier borrow another's discount (the mismatch bug)", () => {
    const tiers = resolveTiers(
      [
        row({ id: "p10", name: "10% OFF", discount_value: 10 }),
        row({ id: "p5", name: "5% OFF", discount_value: 5 }),
      ],
      NO_FALLBACK
    );
    const byId = Object.fromEntries(tiers.map((t) => [t.prize_id, t.discount_value]));
    expect(byId).toEqual({ p10: 10, p5: 5 });
  });

  it("inherits the campaign fallback when a tier has no own discount (legacy single-tier)", () => {
    const tiers = resolveTiers(
      [row({ discount_type: null, discount_value: null })],
      { discount_type: "percentage", discount_value: 15 }
    );
    expect(tiers).toHaveLength(1);
    expect(tiers[0].discount_type).toBe("percentage");
    expect(tiers[0].discount_value).toBe(15);
  });

  it("prefers the tier's own discount over the fallback", () => {
    const tiers = resolveTiers([row({ discount_value: 5 })], {
      discount_type: "percentage",
      discount_value: 15,
    });
    expect(tiers[0].discount_value).toBe(5);
  });

  it("drops a tier that resolves to no discount", () => {
    expect(
      resolveTiers([row({ discount_type: null, discount_value: null })], NO_FALLBACK)
    ).toEqual([]);
  });

  it("drops a tier whose discount value is zero or negative", () => {
    expect(resolveTiers([row({ discount_value: 0 })], NO_FALLBACK)).toEqual([]);
    expect(resolveTiers([row({ discount_value: -5 })], NO_FALLBACK)).toEqual([]);
  });

  it("coerces a string-ish discount value to a number", () => {
    const tiers = resolveTiers(
      [row({ discount_value: "20" as unknown as number })],
      NO_FALLBACK
    );
    expect(tiers[0].discount_value).toBe(20);
    expect(typeof tiers[0].discount_value).toBe("number");
  });

  it("defaults total_quantity to 0 when null", () => {
    const tiers = resolveTiers([row({ total_quantity: null })], NO_FALLBACK);
    expect(tiers[0].total_quantity).toBe(0);
  });

  it("supports fixed_amount tiers", () => {
    const tiers = resolveTiers(
      [row({ discount_type: "fixed_amount", discount_value: 100 })],
      NO_FALLBACK
    );
    expect(tiers[0].discount_type).toBe("fixed_amount");
    expect(tiers[0].discount_value).toBe(100);
  });
});

describe("buildParentDiscountTitle", () => {
  it("uses the campaign headline alone for a single tier", () => {
    expect(buildParentDiscountTitle("Scratch & Win this Onam! 🎁", "5% OFF Coupon", 1)).toBe(
      "Scratch & Win this Onam! 🎁"
    );
  });

  it("appends the tier name when multiple tiers share one campaign", () => {
    expect(
      buildParentDiscountTitle("Scratch & Win this Onam! 🎁", "10% OFF Coupon", 2)
    ).toBe("Scratch & Win this Onam! 🎁 — 10% OFF Coupon");
  });

  it("truncates very long titles for Shopify Admin", () => {
    const long = "A".repeat(130);
    expect(buildParentDiscountTitle(long, "Tier", 2).length).toBeLessThanOrEqual(120);
  });
});
