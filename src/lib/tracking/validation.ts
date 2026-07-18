import type { ProviderKey } from "./types";

/**
 * Per-provider id validation. Used BOTH server-side (before persisting a
 * merchant's id) and client-side (before injecting it into a script). The
 * patterns are deliberately strict allow-lists — anything that isn't a
 * plausible id is rejected, which is the primary XSS defence: an id that
 * matches these can only contain the whitelisted characters, so it can
 * never carry markup or a script break-out.
 */
const PATTERNS: Record<ProviderKey, RegExp> = {
  // Meta Pixel IDs are 15–16 digit numbers.
  meta_pixel: /^\d{15,16}$/,
  // GTM container: GTM-XXXXXXX (letters/digits).
  gtm: /^GTM-[A-Z0-9]{5,10}$/,
  // GA4 Measurement ID: G-XXXXXXXXXX.
  ga4: /^G-[A-Z0-9]{6,12}$/,
  // Clarity project id: lowercase alphanumeric.
  clarity: /^[a-z0-9]{6,15}$/,
  // Microsoft Ads UET tag id: numeric.
  microsoft_ads: /^\d{6,12}$/,
  // TikTok Pixel id: uppercase alphanumeric.
  tiktok: /^[A-Z0-9]{15,25}$/,
  // LinkedIn Insight partner id: numeric.
  linkedin: /^\d{5,10}$/,
  // Pinterest tag id: numeric.
  pinterest: /^\d{12,20}$/,
};

/** True if `id` is a well-formed id for `provider`. Empty/blank → false. */
export function isValidProviderId(provider: ProviderKey, id: string): boolean {
  const trimmed = (id ?? "").trim();
  if (!trimmed) return false;
  const re = PATTERNS[provider];
  return re ? re.test(trimmed) : false;
}

/** Human-readable format hint for the merchant UI (and error messages). */
export const PROVIDER_ID_FORMAT: Record<ProviderKey, string> = {
  meta_pixel: "15–16 digit Pixel ID",
  gtm: "GTM-XXXXXXX",
  ga4: "G-XXXXXXXXXX",
  clarity: "10-char project id",
  microsoft_ads: "numeric UET Tag ID",
  tiktok: "alphanumeric Pixel ID",
  linkedin: "numeric Partner ID",
  pinterest: "numeric Tag ID",
};
