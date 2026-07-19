"use client";

/**
 * Typed browser fetch client for `/api/v1`.
 *
 * Every v1 endpoint returns the standard envelope `{ ok, data, page?, meta }`.
 * This helper unwraps it: on `ok:true` it returns `{ data, page, meta }`; on
 * `ok:false` (or a network/parse failure) it throws `ApiError` carrying the
 * server's `code`/`message` so React Query surfaces a real error state.
 *
 * Auth: requests are same-origin, so the httpOnly `merchant_session` cookie is
 * sent automatically (`credentials: "same-origin"`). The v1 auth guard's
 * cookie resolver reads that session and derives `businessId` server-side — the
 * client NEVER sends a tenant id. (Verified: guard.ts `merchantCookieResolver`
 * → `getMerchantSession()`.)
 */

import type { ApiBody, PageInfo, ResponseMeta } from "@/lib/api/types";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly correlationId?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    correlationId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.correlationId = correlationId;
  }
}

export interface ApiResult<T> {
  data: T;
  page?: PageInfo;
  meta: ResponseMeta;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
  /** JSON body — serialized automatically. */
  body?: unknown;
  /** AbortSignal from React Query, so cancelled queries abort the fetch. */
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = "GET", body, signal } = opts;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    // Network failure / abort — no envelope to parse.
    if (signal?.aborted) throw cause;
    throw new ApiError("network_error", "Network request failed. Please retry.", 0);
  }

  let json: ApiBody<T>;
  try {
    json = (await res.json()) as ApiBody<T>;
  } catch {
    throw new ApiError(
      "invalid_response",
      "The server returned an unexpected response.",
      res.status
    );
  }

  if (!json.ok) {
    throw new ApiError(
      json.error.code,
      json.error.message,
      res.status,
      json.error.details,
      json.meta?.correlationId
    );
  }

  return { data: json.data, page: json.page, meta: json.meta };
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PUT", body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PATCH", body, signal }),
  del: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "DELETE", signal }),
};

/** Build a `/api/v1/...` query string from a params object, dropping nullish values. */
export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}
