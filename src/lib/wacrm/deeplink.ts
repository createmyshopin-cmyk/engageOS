import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SSO_TTL_SECONDS = 120;

export interface WacrmSsoPayload {
  accountId: string;
  businessId: string;
  merchantId: string;
  path: string;
  embed: boolean;
  exp: number;
  nonce: string;
}

function ssoSecret(): string {
  const secret = process.env.ENGAGEOS_WACRM_SSO_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "ENGAGEOS_WACRM_SSO_SECRET must be set (>= 32 chars) for WACRM deep-links"
    );
  }
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", ssoSecret()).update(data).digest("base64url");
}

/** Mint a short-lived SSO token for WACRM session exchange. */
export function mintWacrmSsoToken(params: {
  accountId: string;
  businessId: string;
  merchantId: string;
  path: string;
  embed?: boolean;
  ttlSeconds?: number;
}): { token: string; expiresIn: number } {
  const ttl = params.ttlSeconds ?? SSO_TTL_SECONDS;
  const payload: WacrmSsoPayload = {
    accountId: params.accountId,
    businessId: params.businessId,
    merchantId: params.merchantId,
    path: params.path.startsWith("/") ? params.path : `/${params.path}`,
    embed: params.embed === true,
    exp: Math.floor(Date.now() / 1000) + ttl,
    nonce: randomBytes(16).toString("hex"),
  };

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${data}.${sign(data)}`;
  return { token, expiresIn: ttl };
}

/** Build the WACRM auth exchange URL (opens session, then redirects to feature path). */
export function buildWacrmLaunchUrl(
  baseUrl: string,
  token: string,
  opts?: { embed?: boolean }
): string {
  const root = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${root}/auth/engageos`);
  url.searchParams.set("token", token);
  if (opts?.embed) {
    url.searchParams.set("embed", "1");
  }
  return url.toString();
}

/** Parse and verify an SSO token (used in tests; WACRM verifies independently). */
export function verifyWacrmSsoToken(token: string): WacrmSsoPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(data);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as WacrmSsoPayload;
    if (!payload.accountId || !payload.path || !payload.nonce) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
