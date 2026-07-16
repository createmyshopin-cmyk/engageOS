"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { hash, verify } from "@node-rs/argon2";
import { adminClient, recordCampaignEvent } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { createMerchantSession } from "@/lib/merchant-session";
import type { MerchantSessionPayload } from "@/lib/types";

export interface MerchantAuthState {
  error: string | null;
  field?: "email" | "password" | "general";
}

// Argon2id parameters (OWASP minimum recommended)
const ARGON2_CONFIG = {
  memoryCost: 65536,  // 64 MB
  timeCost: 3,
  parallelism: 1,
};

/**
 * Login action — validates credentials, enforces rate limit, creates session.
 */
export async function merchantLoginAction(
  _prev: MerchantAuthState,
  formData: FormData
): Promise<MerchantAuthState> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const rememberMe = formData.get("rememberMe") === "on";
  // Safe redirect destination injected by the login page as a hidden input
  const rawFrom = (formData.get("from") as string | null) ?? "";
  const destination = /^\/m\/[a-zA-Z0-9\-_/]*$/.test(rawFrom) ? rawFrom : "/m/dashboard";

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", field: "email" };
  }
  if (!password || password.length < 6) {
    return { error: "Password is required.", field: "password" };
  }

  const ip = clientIpFromHeaders(await headers());
  const supabase = adminClient();

  // --- Rate limit: 10 attempts per IP per hour ---
  const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
    p_key: `mlogin:${ip}`,
    p_max: 10,
  });
  if (rlError) {
    console.error("merchant login rate limit error:", rlError);
    return { error: "Server error. Please try again.", field: "general" };
  }
  if (!allowed) {
    return { error: "Too many login attempts. Please wait 1 hour and try again.", field: "general" };
  }

  // --- Look up merchant by email ---
  const { data: merchant, error: dbError } = await supabase
    .from("merchants")
    .select("id, business_id, name, email, password_hash, role, status")
    .eq("email", email)
    .maybeSingle();

  if (dbError) {
    console.error("merchant lookup error:", dbError);
    return { error: "Server error. Please try again.", field: "general" };
  }

  // Always run a real Argon2id verification, even when the email is unknown,
  // so response time does not reveal whether an account exists. DUMMY_HASH is a
  // genuine Argon2id digest of a random sentinel string — verify() performs the
  // full KDF work and returns false rather than throwing on a malformed hash.
  const DUMMY_HASH =
    "$argon2id$v=19$m=65536,t=3,p=1$Hb4W0WaoAvhZbhQXbUidig$MkbP/muHHQxubxBAQrW/sHuOJtKPT56/VrW/6VunWo4";

  let passwordValid = false;
  try {
    passwordValid = await verify(merchant?.password_hash ?? DUMMY_HASH, password);
  } catch (err) {
    // A stored hash that fails to parse must not authenticate the user.
    console.error("merchant password verify error:", err);
    passwordValid = false;
  }

  if (!merchant || !passwordValid) {
    return { error: "Invalid email or password.", field: "general" };
  }

  if (merchant.status !== "active") {
    return { error: "Your account has been suspended. Contact support.", field: "general" };
  }

  // --- Create session ---
  const payload: MerchantSessionPayload = {
    merchantId: merchant.id,
    businessId: merchant.business_id,
    name: merchant.name,
    email: merchant.email,
    role: merchant.role as MerchantSessionPayload["role"],
  };

  try {
    await createMerchantSession(payload, rememberMe);
  } catch (err) {
    console.error("session creation error:", err);
    return { error: "Server error. Please try again.", field: "general" };
  }

  // Immutable login event (tenant-scoped, no campaign). Actor resolved from
  // the just-authenticated merchant, never the client. Best-effort.
  await recordCampaignEvent({
    businessId: merchant.business_id,
    actorType:
      merchant.role === "owner"
        ? "merchant_owner"
        : merchant.role === "manager"
        ? "merchant_manager"
        : "merchant_staff",
    actorId: merchant.id,
    eventType: "merchant.login",
    metadata: { email: merchant.email, role: merchant.role },
    ip,
    userAgent: (await headers()).get("user-agent"),
  });

  redirect(destination);
}

/**
 * Forgot password — foundation only.
 * Sends a placeholder response to avoid user enumeration.
 */
export async function merchantForgotAction(
  _prev: MerchantAuthState,
  formData: FormData
): Promise<MerchantAuthState> {
  const email = (formData.get("email") as string | null)?.toLowerCase().trim() ?? "";

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", field: "email" };
  }

  // TODO: Implement actual password reset email flow.
  // For now, always return the same response to prevent user enumeration.
  return {
    error: null,
    // We reuse the error field with null to signal success upstream
  };
}

/**
 * Admin utility: hash a plain password for inserting into merchants table.
 */
export async function hashMerchantPassword(password: string): Promise<string> {
  return hash(password, ARGON2_CONFIG);
}
