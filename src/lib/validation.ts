import { z } from "zod";

/**
 * Indian mobile number entered by the customer. Accepts common formats
 * (10 digits, +91..., 91..., with spaces/dashes) and normalizes to E.164.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/[\s-]/g, ""))
  .transform((v) => {
    if (/^\+91[6-9]\d{9}$/.test(v)) return v;
    if (/^91[6-9]\d{9}$/.test(v)) return `+${v}`;
    if (/^0[6-9]\d{9}$/.test(v)) return `+91${v.slice(1)}`;
    if (/^[6-9]\d{9}$/.test(v)) return `+91${v}`;
    return v; // fall through to refine below
  })
  .refine((v) => /^\+91[6-9]\d{9}$/.test(v), {
    message: "Enter a valid 10-digit mobile number",
  });

export const deviceIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Invalid device");

export const playRequestSchema = z.object({
  merchantSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "Invalid merchant"),
  campaignSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/, "Invalid campaign"),
  name: z
    .string()
    .trim()
    .min(2, "Enter your name")
    .max(60, "Name is too long")
    // letters (incl. Malayalam), spaces, dots — no digits/symbols
    .regex(/^[\p{L}\p{M} .]+$/u, "Enter a valid name"),
  phone: phoneSchema,
  whatsappConsent: z
    .boolean()
    .refine((accepted) => accepted, "Accept WhatsApp updates to continue"),
  source: z.string().optional(),
  deviceId: deviceIdSchema,
});
export type PlayRequest = z.infer<typeof playRequestSchema>;

/**
 * Traffic-source tag from the optional `?src=` query param. Lowercased,
 * slug-safe, capped. Anything missing/invalid collapses to "direct" so the
 * aggregate always has a bucket. Kept permissive (letters/digits/dash/underscore)
 * so merchants can coin their own source names (front-gate, billing, instagram…).
 */
export const SOURCE_MAX_LEN = 40;
export function normalizeSource(raw: unknown): string {
  if (typeof raw !== "string") return "direct";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SOURCE_MAX_LEN);
  return cleaned.length >= 1 ? cleaned : "direct";
}

export const sourceSchema = z
  .string()
  .optional()
  .transform((v) => normalizeSource(v));

export const redeemRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ONAM-[A-Z2-9]{4}$/, "Invalid coupon code format"),
});
export type RedeemRequest = z.infer<typeof redeemRequestSchema>;

export const staffLoginSchema = z.object({
  businessSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "Invalid business"),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
});
export type StaffLogin = z.infer<typeof staffLoginSchema>;

// ---------- Operator onboarding (internal /admin) ----------

export const prizeInputSchema = z.object({
  name: z.string().trim().min(2, "Prize name required").max(60),
  quantity: z.coerce.number().int().min(1).max(100000),
  tier: z.enum(["everyone", "common", "rare"]),
});

/** tier → draw weight. "everyone" floods the pool so losing is rare. */
export const TIER_WEIGHTS: Record<z.infer<typeof prizeInputSchema>["tier"], number> = {
  everyone: 1000,
  common: 100,
  rare: 5,
};

export const onboardMerchantSchema = z.object({
  businessName: z.string().trim().min(2, "Shop name required").max(80),
  city: z.string().trim().max(60).optional().or(z.literal("")),
  ownerPhone: phoneSchema,
  pin: z.string().trim().regex(/^\d{6,8}$/, "PIN must be 6-8 digits"),
  campaignName: z.string().trim().min(2, "Campaign name required").max(80),
  headline: z.string().trim().min(2).max(60).default("Scratch & Win this Onam!"),
  endsAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: "End date must be in the future",
  }),
  prizes: z.array(prizeInputSchema).min(1, "Add at least one prize").max(8),
});
export type OnboardMerchant = z.infer<typeof onboardMerchantSchema>;

/**
 * Redirect URL safety gate for the Post Win engine. The customer's browser is
 * sent to whatever a merchant configures, so we only ever allow plain https://
 * and reject anything that could smuggle script execution, local file access,
 * or an SSRF-style hop to a private host.
 *
 *   Allow:  https://<public-host>/...
 *   Block:  javascript: / file: / data: / blob: / http: (non-TLS)
 *           localhost, *.local, 127.0.0.0/8, 10/8, 172.16/12, 192.168/16,
 *           169.254/16 (link-local), ::1 and other loopback/private literals.
 */
export function isSafeRedirectUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.trim() === "") return false;
  const value = raw.trim();

  // Reject dangerous schemes up-front (covers whitespace/case obfuscation).
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    const scheme = value.slice(0, value.indexOf(":")).toLowerCase();
    if (scheme !== "https") return false;
  } else {
    // No scheme at all — not an absolute https URL.
    return false;
  }

  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return false;

  // Loopback / local hostnames.
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local")) return false;

  // IPv6 loopback / unique-local / link-local.
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return false;
  }

  // IPv4 private / loopback / link-local ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }

  return true;
}

/** URL-safe slug from a shop/campaign name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
