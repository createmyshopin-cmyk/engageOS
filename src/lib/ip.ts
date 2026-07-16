import "server-only";

/**
 * Client IP for rate limiting. Order matters for spoof resistance:
 * `x-real-ip` and `x-vercel-forwarded-for` are set by the Vercel
 * platform and cannot be forged by the client; the first entry of
 * `x-forwarded-for` CAN be (clients may send their own header and
 * proxies append). Never trust x-forwarded-for[0] for security.
 */
export function clientIpFromHeaders(h: Headers): string {
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    // Last hop is the one appended by our own edge — least spoofable.
    const parts = fwd.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}
