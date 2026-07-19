import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { getWatiIntegration } from "@/lib/wati/store";
import { ShopifyReadRepository } from "@/server/modules/shopify/read-repository";

export const runtime = "nodejs";

/** Lightweight nav visibility flags — one auth check, one round trip. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const [wati, shop] = await Promise.all([
      getWatiIntegration(repo.businessId),
      new ShopifyReadRepository(repo).shop(),
    ]);

    return NextResponse.json({
      ok: true,
      watiConnected: wati?.status === "connected",
      shopifyConnected: shop != null && shop.status === "active",
    });
  } catch (err) {
    console.error("nav-status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load integration status" },
      { status: 500 }
    );
  }
}
