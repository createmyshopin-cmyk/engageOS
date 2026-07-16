import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/db/rpc";
import type { MerchantSessionPayload } from "@/lib/types";

const COOKIE_NAME = "merchant_session";
const HMAC_ALG = "sha256";

// ---------- Config ----------

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be >= 32 chars");
  }
  return s;
}

function sign(data: string): string {
  return createHmac(HMAC_ALG, secret()).update(data).digest("base64url");
}

function buildCookieValue(token: string): string {
  return `${token}.${sign(token)}`;
}

function verifyCookieValue(raw: string): string | null {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(token));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null;
  }
  return token;
}

// ---------- Public API ----------

/**
 * Creates a new DB session row and sets a signed httpOnly cookie.
 * @param payload  - stripped merchant info (no password_hash)
 * @param rememberMe - 30d vs 7d TTL
 */
export async function createMerchantSession(
  payload: MerchantSessionPayload,
  rememberMe: boolean
): Promise<void> {
  const ttlDays = rememberMe ? 30 : 7;
  const ttlSeconds = ttlDays * 86400;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const sessionToken = randomBytes(32).toString("hex"); // 64-char hex

  const supabase = adminClient();

  // Lazy cleanup of expired sessions (max once per login, cheap)
  await supabase.rpc("purge_expired_merchant_sessions").maybeSingle();

  const { error } = await supabase.from("merchant_sessions").insert({
    merchant_id: payload.merchantId,
    session_token: sessionToken,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Failed to create merchant session: ${error.message}`);

  // Update last_login timestamp
  await supabase
    .from("merchants")
    .update({ last_login: new Date().toISOString() })
    .eq("id", payload.merchantId);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, buildCookieValue(sessionToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
}

/**
 * Reads and validates the session cookie.
 * Returns the merchant session payload or null if invalid/expired.
 */
export async function getMerchantSession(): Promise<MerchantSessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const token = verifyCookieValue(raw);
  if (!token) return null;

  const supabase = adminClient();

  // Step 1: look up session row
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("merchant_sessions")
    .select("merchant_id, expires_at")
    .eq("session_token", token)
    .maybeSingle();

  if (sessionErr || !sessionRow) return null;

  // Check expiry
  if (new Date(sessionRow.expires_at) < new Date()) {
    await clearMerchantSession();
    return null;
  }

  // Step 2: look up merchant
  const { data: merchant, error: merchantErr } = await supabase
    .from("merchants")
    .select("id, business_id, name, email, role, status")
    .eq("id", sessionRow.merchant_id)
    .maybeSingle();

  if (merchantErr || !merchant) return null;
  if ((merchant.status as string) !== "active") return null;

  return {
    merchantId: merchant.id as string,
    businessId: merchant.business_id as string,
    name: merchant.name as string,
    email: merchant.email as string,
    role: merchant.role as MerchantSessionPayload["role"],
  };
}

/**
 * Deletes the DB session and clears the cookie.
 */
export async function clearMerchantSession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;

  if (raw) {
    const token = verifyCookieValue(raw);
    if (token) {
      await adminClient()
        .from("merchant_sessions")
        .delete()
        .eq("session_token", token);
    }
    cookieStore.delete({ name: COOKIE_NAME, path: "/" });
  }
}
