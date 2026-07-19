import "server-only";
import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for per-tenant wacrm secrets (API keys, webhook
 * secrets). Ciphertext format: `v1:<iv b64>:<authTag b64>:<ciphertext b64>`.
 * The key comes from WACRM_ENCRYPTION_KEY (64 hex chars = 32 bytes) so the
 * database never stores a plaintext credential.
 */

function encryptionKey(): Buffer {
  const hex = process.env.WACRM_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "WACRM_ENCRYPTION_KEY must be set. " +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "WACRM_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unrecognized encrypted secret format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Verify a wacrm outbound-webhook signature header:
 *   X-Wacrm-Signature: t=<unix_seconds>,v1=<hex hmac-sha256(secret, "t.rawBody")>
 * Constant-time compare + replay window (default 5 minutes).
 */
export function verifyWacrmSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  if (!header) return false;
  const match = header.match(/t=(\d+),v1=([0-9a-f]+)/);
  if (!match) return false;
  const [, t, v1] = match;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
