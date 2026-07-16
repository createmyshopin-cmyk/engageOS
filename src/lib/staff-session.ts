import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { cookies } from "next/headers";

/**
 * Staff session: a signed, httpOnly cookie identifying which business
 * a staff member may redeem coupons for. No Supabase Auth — staff log
 * in with the business slug + a 4-6 digit PIN handed over during
 * onboarding. HMAC-SHA256 signed payload, 12 hour validity.
 */

const COOKIE_NAME = "staff_session";
const SESSION_HOURS = 16; // covers any retail day incl. festival late closing

interface StaffSession {
  businessId: string;
  businessName: string;
  exp: number; // unix seconds
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Hash a staff PIN with Argon2id (same parameters as merchant passwords).
 * Stored in businesses.staff_pin as a `$argon2id$...` PHC string.
 */
export async function hashPin(pin: string): Promise<string> {
  return argon2Hash(pin, { memoryCost: 65536, timeCost: 3, parallelism: 1 });
}

/** Legacy unsalted SHA-256 hex — retained only to verify pre-migration PINs. */
function legacySha256(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

/**
 * Constant-time verification of a submitted PIN against the stored hash.
 * Accepts both the new Argon2id format and legacy 64-char SHA-256 hex hashes
 * (created before the upgrade) so existing merchants keep working. Legacy PINs
 * are transparently re-hashed on next successful admin PIN update.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$argon2")) {
    try {
      return await argon2Verify(storedHash, pin);
    } catch {
      return false;
    }
  }
  // Legacy path: unsalted SHA-256 hex, compared in constant time.
  const a = Buffer.from(legacySha256(pin), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when a stored hash is in the legacy SHA-256 format and should be upgraded. */
export function isLegacyPinHash(storedHash: string): boolean {
  return !storedHash.startsWith("$argon2");
}

export async function createStaffSession(
  businessId: string,
  businessName: string
): Promise<void> {
  const session: StaffSession = {
    businessId,
    businessName,
    exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600,
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const value = `${payload}.${sign(payload)}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let session: StaffSession;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof session.businessId !== "string" ||
    typeof session.businessName !== "string" ||
    typeof session.exp !== "number" ||
    session.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return session;
}

export async function clearStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
