"use client";

/**
 * Fetch helper for the WATI console endpoints. A 401 means the merchant
 * session expired — bounce to login with a return path to /m/wati instead
 * of dead-ending on an "Unauthorized" banner.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWatiConsole(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/wati";
    return new Promise(() => {});
  }
  return res.json();
}
