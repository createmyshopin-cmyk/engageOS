"use client";

export async function commFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/communication/inbox";
    return new Promise(() => {});
  }
  const json = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json;
}
