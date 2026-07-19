import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Secret prefix on every Google Sheets export key. */
export const SHEETS_API_KEY_PREFIX = "eos_sheets_live_";

const DISPLAY_BODY_CHARS = 8;

export interface GeneratedSheetsApiKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

export function generateSheetsApiKey(): GeneratedSheetsApiKey {
  const body = randomBytes(32).toString("base64url");
  const plaintext = `${SHEETS_API_KEY_PREFIX}${body}`;
  return {
    plaintext,
    hash: hashSheetsApiKey(plaintext),
    prefix: `${SHEETS_API_KEY_PREFIX}${body.slice(0, DISPLAY_BODY_CHARS)}`,
  };
}

export function hashSheetsApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function looksLikeSheetsApiKey(value: string): boolean {
  return value.startsWith(SHEETS_API_KEY_PREFIX) && value.length > SHEETS_API_KEY_PREFIX.length;
}

export function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
