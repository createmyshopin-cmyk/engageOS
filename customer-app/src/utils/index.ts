/** Client-side mirrors of backend validation (src/lib/validation.ts). */

const NAME_RE = /^[\p{L}\p{M} .]{2,60}$/u;

export function validateName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return "Please enter your name";
  if (!NAME_RE.test(name)) return "Only letters, spaces and dots allowed";
  return null;
}

/** Normalize an Indian mobile to +91XXXXXXXXXX or return null. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("+91")) n = n.slice(3);
  else if (n.startsWith("91") && n.length === 12) n = n.slice(2);
  else if (n.startsWith("0") && n.length === 11) n = n.slice(1);
  if (!/^[6-9]\d{9}$/.test(n)) return null;
  return `+91${n}`;
}

export function normalizeSource(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || undefined;
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i;

/** HTTPS-only, no private/loopback hosts. Mirrors isSafeRedirectUrl. */
export function isSafeRedirectUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (PRIVATE_HOST_RE.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Map an https destination to a native deep link where one exists. */
export function toDeepLink(
  destinationType: string,
  httpsUrl: string,
): string | null {
  try {
    const u = new URL(httpsUrl);
    switch (destinationType) {
      case "instagram": {
        const handle = u.pathname.split("/").filter(Boolean)[0];
        return handle ? `instagram://user?username=${handle}` : null;
      }
      case "youtube":
        return `vnd.youtube:${u.pathname}${u.search}`;
      case "whatsapp": {
        const phone = u.pathname.split("/").filter(Boolean)[0];
        return phone ? `whatsapp://send?phone=${phone}` : null;
      }
      case "telegram": {
        const handle = u.pathname.split("/").filter(Boolean)[0];
        return handle ? `tg://resolve?domain=${handle}` : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Optional haptic tick — no-op where unsupported. */
export function haptic(pattern: number | number[] = 10) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
