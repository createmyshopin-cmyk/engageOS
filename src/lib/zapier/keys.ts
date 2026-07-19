import { createHash, randomBytes } from "node:crypto";

/** Secret prefix on every merchant programmatic API key. */
export const MERCHANT_API_KEY_PREFIX = "eos_live_";

const DISPLAY_BODY_CHARS = 8;

/** Default scopes granted to Zapier integration keys. */
export const ZAPIER_KEY_SCOPES = ["read", "write", "zapier:hooks"] as const;

export interface GeneratedMerchantApiKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

export function generateMerchantApiKey(): GeneratedMerchantApiKey {
  const body = randomBytes(32).toString("base64url");
  const plaintext = `${MERCHANT_API_KEY_PREFIX}${body}`;
  return {
    plaintext,
    hash: hashMerchantApiKey(plaintext),
    prefix: `${MERCHANT_API_KEY_PREFIX}${body.slice(0, DISPLAY_BODY_CHARS)}`,
  };
}

export function hashMerchantApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function looksLikeMerchantApiKey(value: string): boolean {
  return value.startsWith(MERCHANT_API_KEY_PREFIX) && value.length > MERCHANT_API_KEY_PREFIX.length;
}
