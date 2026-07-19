import "server-only";
import type { NextRequest } from "next/server";
import { getMerchantSession } from "@/lib/merchant-session";
import {
  hashSheetsApiKey,
  looksLikeSheetsApiKey,
} from "@/lib/google-sheets/keys";
import { getGoogleSheetsIntegrationByApiKeyHash } from "@/lib/google-sheets/store";
import {
  hashMerchantApiKey,
  looksLikeMerchantApiKey,
} from "@/lib/zapier/keys";
import { findActiveKeyByHash, touchKeyLastUsed } from "@/lib/zapier/store";
import type { MerchantSessionPayload, MerchantRole } from "@/lib/types";
import { UnauthorizedError, ForbiddenError } from "@/server/core/errors";

/**
 * Authentication for the Enterprise API.
 *
 * The API must eventually serve four surfaces — dashboard (cookie), customer
 * app (cookie), mobile app, and AI services (both programmatic). Rather than
 * bake cookie auth into every controller, auth is a CHAIN of resolvers tried in
 * order. Today only the cookie resolver is registered; a Bearer API-key
 * resolver can be added later WITHOUT touching a single controller — it just
 * registers ahead of / behind the cookie resolver here.
 *
 * The resolved principal always carries `businessId` derived server-side from a
 * trusted credential. Controllers read tenancy from the principal, NEVER from
 * the request body or query — so a client can never act on another tenant.
 */

export type PrincipalKind = "merchant" | "api_key";

export interface Principal {
  kind: PrincipalKind;
  /** Tenant this principal acts within. The ONLY trusted source of business_id. */
  businessId: string;
  /** Merchant user id when kind === "merchant"; api-key id when kind === "api_key". */
  actorId: string;
  role: MerchantRole;
  /** Coarse scopes the principal holds. Cookie sessions get role-implied scopes. */
  scopes: readonly string[];
  /** The underlying merchant session, present for cookie principals. */
  session?: MerchantSessionPayload;
}

/** A resolver returns a Principal if it can authenticate the request, else null. */
export interface AuthResolver {
  readonly name: string;
  resolve(req: NextRequest): Promise<Principal | null>;
}

/** Role → implied scopes. Owners/managers get write; staff is read + redeem. */
function scopesForRole(role: MerchantRole): readonly string[] {
  switch (role) {
    case "owner":
      return ["*"];
    case "manager":
      return ["read", "write"];
    case "staff":
      return ["read", "redeem"];
  }
}

/** Cookie-session resolver — reuses the existing merchant HMAC session. */
const merchantCookieResolver: AuthResolver = {
  name: "merchant_cookie",
  async resolve(): Promise<Principal | null> {
    const session = await getMerchantSession();
    if (!session) return null;
    return {
      kind: "merchant",
      businessId: session.businessId,
      actorId: session.merchantId,
      role: session.role,
      scopes: scopesForRole(session.role),
      session,
    };
  },
};

function bearerTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers?.get("authorization")?.trim();
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

/** Merchant programmatic API key (Zapier, automations). */
const merchantApiKeyResolver: AuthResolver = {
  name: "merchant_api_key",
  async resolve(req: NextRequest): Promise<Principal | null> {
    const token = bearerTokenFromRequest(req);
    if (!token || !looksLikeMerchantApiKey(token)) return null;

    const key = await findActiveKeyByHash(hashMerchantApiKey(token));
    if (!key) return null;

    touchKeyLastUsed(key.id);

    return {
      kind: "api_key",
      businessId: key.business_id,
      actorId: key.id,
      role: "owner",
      scopes: key.scopes.length > 0 ? key.scopes : ["read", "write", "zapier:hooks"],
    };
  },
};

/** Google Sheets export API key — scoped to sheets export endpoints. */
const googleSheetsApiKeyResolver: AuthResolver = {
  name: "google_sheets_api_key",
  async resolve(req: NextRequest): Promise<Principal | null> {
    const token = bearerTokenFromRequest(req);
    if (!token || !looksLikeSheetsApiKey(token)) return null;

    const integration = await getGoogleSheetsIntegrationByApiKeyHash(hashSheetsApiKey(token));
    if (!integration || integration.status !== "connected") return null;

    return {
      kind: "api_key",
      businessId: integration.business_id,
      actorId: integration.id,
      role: "owner",
      scopes: ["read", "sheets:export"],
    };
  },
};

/**
 * Ordered resolver chain. API keys are tried before cookies so a programmatic
 * caller cannot accidentally inherit a browser session.
 */
const RESOLVERS: readonly AuthResolver[] = [
  merchantApiKeyResolver,
  googleSheetsApiKeyResolver,
  merchantCookieResolver,
];

/**
 * Authenticate a request, or throw UnauthorizedError. This is the single entry
 * point the route wrapper calls for protected endpoints.
 */
export async function authenticate(req: NextRequest): Promise<Principal> {
  for (const resolver of RESOLVERS) {
    const principal = await resolver.resolve(req);
    if (principal) return principal;
  }
  throw new UnauthorizedError();
}

/** Assert a principal holds a scope (or the wildcard), else ForbiddenError. */
export function requireScope(principal: Principal, scope: string): void {
  if (principal.scopes.includes("*") || principal.scopes.includes(scope)) return;
  throw new ForbiddenError(`Missing required scope: ${scope}`);
}

/** Assert a principal has one of the allowed roles, else ForbiddenError. */
export function requireRole(principal: Principal, ...roles: MerchantRole[]): void {
  if (!roles.includes(principal.role)) {
    throw new ForbiddenError("Your role cannot perform this action");
  }
}
