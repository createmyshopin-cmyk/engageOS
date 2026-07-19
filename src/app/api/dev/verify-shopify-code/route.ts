import { NextRequest, NextResponse } from "next/server";
import { getShopifyForBusiness } from "@/lib/shopify/adapter";
import { verifyDiscountCodeInShopify } from "@/lib/shopify/discounts";
import { adminClient } from "@/lib/db/rpc";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dev/verify-shopify-code?code=SINDUR0122-XXXX
 * Dev-only: confirm a coupon code exists in Shopify Admin.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const devSecret = process.env.DEV_API_SECRET;
  const supplied = req.headers.get("x-dev-secret") ?? "";
  if (
    !devSecret ||
    devSecret.length < 16 ||
    supplied.length !== devSecret.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(devSecret))
  ) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: "code required" }, { status: 400 });
  }

  const { data: coupon } = await adminClient()
    .from("coupons")
    .select(
      "id, code, source, needs_reconciliation, shopify_discount_code_id, shopify_parent_discount_id, business_id"
    )
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (!coupon) {
    return NextResponse.json({ ok: false, error: "coupon not in EngageOS" }, { status: 404 });
  }

  const shopify = await getShopifyForBusiness(coupon.business_id);
  if (!shopify) {
    return NextResponse.json({ ok: false, error: "shopify not connected" }, { status: 503 });
  }

  const verification = await verifyDiscountCodeInShopify(
    shopify.client,
    shopify.shop.shop_domain,
    coupon.code,
    coupon.shopify_discount_code_id,
    coupon.shopify_parent_discount_id
  );

  return NextResponse.json({
    ok: true,
    engageos: coupon,
    shopify: verification,
    hint:
      "In Shopify Admin go to Discounts → open the parent discount title → Codes tab. " +
      "Coupon Drop codes are redeem codes under that parent, not separate discounts.",
  });
}
