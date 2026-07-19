import { after, NextResponse, type NextRequest } from "next/server";
import {
  exchangeCodeForToken,
  isValidShopDomain,
  normalizeShopDomain,
  verifyOAuthHmac,
} from "@/lib/shopify/oauth";
import { consumeOAuthState, createSyncJob } from "@/lib/shopify/store";
import { connectShopify } from "@/lib/shopify/adapter";
import { drainDueJobs } from "@/lib/shopify/sync-engine";
import { createLogger, newCorrelationId } from "@/server/observability/logger";
import type { SyncResource } from "@/lib/shopify/types";
import { SYNC_RESOURCES } from "@/lib/shopify/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/shopify/callback — OAuth redirect target.
 *
 * Shopify redirects here with ?code&shop&state&hmac. Security gates, in order:
 *   1. HMAC over the query verifies the request genuinely came from Shopify.
 *   2. The `state` nonce is consumed (single-use, unexpired) and yields the
 *      businessId — the tenant is derived from OUR persisted state, never from
 *      the query. This binds the token to the business that started the install.
 *   3. `shop` must be a valid myshopify domain and match the state's shop.
 * Then we exchange the code for a permanent token, encrypt+store it, register
 * webhooks, and kick off the initial sync in the background via `after()`.
 */
export async function GET(request: NextRequest) {
  const log = createLogger(newCorrelationId(), { route: "shopify.callback" });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const params = request.nextUrl.searchParams;
  const fail = (msg: string) =>
    NextResponse.redirect(`${appUrl}/m/shopify?shopify_error=${encodeURIComponent(msg)}`);

  // 1. Verify the request HMAC.
  if (!verifyOAuthHmac(params)) {
    log.warn("shopify.callback.bad_hmac");
    return fail("Invalid Shopify signature");
  }

  const code = params.get("code");
  const state = params.get("state");
  const shopParam = params.get("shop");
  const shop = shopParam ? normalizeShopDomain(shopParam) : "";
  if (!code || !state || !isValidShopDomain(shop)) {
    return fail("Malformed Shopify callback");
  }

  // 2. Consume the state nonce → authoritative businessId + expected shop.
  const claimed = await consumeOAuthState(state);
  if (!claimed) {
    log.warn("shopify.callback.bad_state");
    return fail("This connection link expired. Please try connecting again.");
  }
  // 3. The shop in the callback must match the one we started the install for.
  if (normalizeShopDomain(claimed.shop_domain) !== shop) {
    log.warn("shopify.callback.shop_mismatch");
    return fail("Shop mismatch. Please try connecting again.");
  }

  const businessId = claimed.business_id;

  // Exchange code → permanent token, then persist (encrypted) + register hooks.
  let scope = "";
  try {
    const token = await exchangeCodeForToken(shop, code);
    scope = token.scope;
    const result = await connectShopify(businessId, shop, token.accessToken, token.scope);
    log.info("shopify.callback.connected", {
      businessId,
      shop,
      webhooks: result.webhooksRegistered,
    });
  } catch (err) {
    log.error("shopify.callback.exchange_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return fail("Could not complete the Shopify connection. Please try again.");
  }

  // Enqueue an initial sync for every resource the granted scopes cover, then
  // drain in the background so the merchant lands on a store already filling in.
  after(async () => {
    const bg = createLogger(newCorrelationId(), { route: "shopify.callback.bg", businessId });
    try {
      for (const resource of SYNC_RESOURCES) {
        if (!scopeCovers(scope, resource)) continue;
        await createSyncJob(businessId, resource, { mode: "initial", triggeredBy: "system" });
      }
      await drainDueJobs(50);
    } catch (err) {
      bg.error("shopify.callback.initial_sync_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return NextResponse.redirect(`${appUrl}/m/shopify?connected=1`);
}

/** Only enqueue a resource whose read scope(s) the merchant actually granted. */
function scopeCovers(scope: string, resource: SyncResource): boolean {
  const s = scope.split(",").map((x) => x.trim());
  // Most resources need one scope; inventory needs read_inventory AND
  // read_locations (the sync enumerates store locations before pulling levels).
  const need: Record<SyncResource, string[]> = {
    products: ["read_products"],
    orders: ["read_orders"],
    customers: ["read_customers"],
    collections: ["read_products"],
    inventory: ["read_inventory", "read_locations"],
    discounts: ["read_price_rules"],
  };
  return need[resource].every((scopeName) => s.includes(scopeName));
}
