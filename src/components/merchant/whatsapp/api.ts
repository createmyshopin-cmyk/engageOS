"use client";

/**
 * Fetch helper for the WhatsApp adapter endpoints. A 401 means the merchant
 * session expired since the page was rendered — bounce to login with a
 * return path instead of dead-ending on an "Unauthorized" banner.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAdapter(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/whatsapp";
    // Halt the caller quietly; the browser is navigating away.
    return new Promise(() => {});
  }
  return res.json();
}
