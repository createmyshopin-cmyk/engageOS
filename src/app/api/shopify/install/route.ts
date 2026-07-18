import { NextResponse, type NextRequest } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import {
  buildAuthorizeUrl,
  isValidShopDomain,
  newOAuthState,
  normalizeShopDomain,
  oauthConfig,
} from "@/lib/shopify/oauth";
import { createOAuthState } from "@/lib/shopify/store";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shopify/install?shop=<store>.myshopify.com
 *
 * Starts the OAuth install. The merchant MUST be authenticated — the tenant is
 * taken from the session, never from the query, so a store can only ever be
 * bound to the business that initiated the connect. We persist a random `state`
 * nonce (CSRF) and 302 to Shopify's authorize screen.
 */
export async function GET(request: NextRequest) {
  const log = createLogger(newCorrelationId(), { route: "shopify.install" });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.redirect(`${appUrl}/m/login?from=/m/shopify`);
  }

  const shopParam = request.nextUrl.searchParams.get("shop");
  const shop = shopParam ? normalizeShopDomain(shopParam) : "";
  if (!isValidShopDomain(shop)) {
    return NextResponse.redirect(
      `${appUrl}/m/shopify?shopify_error=${encodeURIComponent("Enter a valid myshopify.com domain")}`
    );
  }

  try {
    oauthConfig(); // throws if the app isn't configured
  } catch {
    return NextResponse.redirect(
      `${appUrl}/m/shopify?shopify_error=${encodeURIComponent("Shopify integration is not configured")}`
    );
  }

  const state = newOAuthState();
  await createOAuthState(state, session.businessId, shop);
  log.info("shopify.install.started", { businessId: session.businessId, shop });

  return NextResponse.redirect(buildAuthorizeUrl(shop, state));
}
