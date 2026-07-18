import "server-only";
import type { ShopifyPage } from "@/lib/shopify/types";

/**
 * Thin, stateless Shopify Admin REST client. One instance per (shop, token);
 * holds no cross-request state beyond its credentials. Every response is
 * `cache: "no-store"` — sync data must never be served stale from a fetch cache.
 *
 * Pagination uses Shopify's cursor-based `Link` header (`page_info`), the only
 * supported scheme on the Admin API. Callers pass the opaque `pageInfo` back to
 * resume — this is exactly the token we persist on the sync job so an
 * interrupted run resumes where it stopped.
 *
 * Rate limits: Shopify returns 429 with `Retry-After`. We surface that as a
 * typed error carrying the retry delay so the sync loop can back off precisely
 * rather than hammering the bucket.
 */

export const SHOPIFY_API_VERSION = "2025-01";

export class ShopifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds to wait before retrying, when the API told us (429/503). */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }

  get isRateLimit(): boolean {
    return this.status === 429;
  }

  /** 401/403 — the token was revoked or lost a scope; reconnect required. */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface ListParams {
  /** Page size (Shopify max is 250). */
  limit?: number;
  /** Opaque resume cursor from a previous page's `nextPageInfo`. */
  pageInfo?: string | null;
  /** ISO timestamp — only records updated at/after this (incremental sync). */
  updatedAtMin?: string | null;
  /** Extra query params (e.g. status filters). Ignored alongside pageInfo. */
  extra?: Record<string, string>;
}

export class ShopifyClient {
  private readonly base: string;

  constructor(
    private readonly shopDomain: string,
    private readonly accessToken: string,
    private readonly apiVersion: string = SHOPIFY_API_VERSION
  ) {
    this.base = `https://${shopDomain}/admin/api/${apiVersion}`;
  }

  /** GET a REST resource collection, returning items + the next page cursor. */
  async list<T = Record<string, unknown>>(
    resourcePath: string,
    key: string,
    params: ListParams = {}
  ): Promise<ShopifyPage<T>> {
    const url = new URL(`${this.base}/${resourcePath}.json`);
    url.searchParams.set("limit", String(Math.min(params.limit ?? 250, 250)));

    // Shopify forbids mixing page_info with other filters: once paginating,
    // only `limit` may accompany the cursor.
    if (params.pageInfo) {
      url.searchParams.set("page_info", params.pageInfo);
    } else {
      if (params.updatedAtMin) url.searchParams.set("updated_at_min", params.updatedAtMin);
      for (const [k, v] of Object.entries(params.extra ?? {})) url.searchParams.set(k, v);
    }

    const res = await this.fetch(url.toString());
    const body = (await res.json()) as Record<string, T[]>;
    return {
      items: Array.isArray(body[key]) ? body[key] : [],
      nextPageInfo: parseNextPageInfo(res.headers.get("link")),
    };
  }

  /** GET a single JSON resource (e.g. the shop record, a count). */
  async get<T = Record<string, unknown>>(resourcePath: string): Promise<T> {
    const res = await this.fetch(`${this.base}/${resourcePath}.json`);
    return (await res.json()) as T;
  }

  /** Total count for a resource (Shopify `/count` endpoints) — for progress. */
  async count(resourcePath: string, extra: Record<string, string> = {}): Promise<number> {
    const url = new URL(`${this.base}/${resourcePath}/count.json`);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    const res = await this.fetch(url.toString());
    const body = (await res.json()) as { count?: number };
    return typeof body.count === "number" ? body.count : 0;
  }

  /** Register a webhook subscription. Returns the created webhook id. */
  async createWebhook(topic: string, address: string): Promise<string | null> {
    const res = await this.fetch(`${this.base}/webhooks.json`, {
      method: "POST",
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    const body = (await res.json()) as { webhook?: { id?: number | string } };
    return body.webhook?.id != null ? String(body.webhook.id) : null;
  }

  /** List currently-registered webhooks (used to avoid duplicate registration). */
  async listWebhooks(): Promise<Array<{ id: string; topic: string; address: string }>> {
    const res = await this.fetch(`${this.base}/webhooks.json?limit=250`);
    const body = (await res.json()) as {
      webhooks?: Array<{ id: number | string; topic: string; address: string }>;
    };
    return (body.webhooks ?? []).map((w) => ({
      id: String(w.id),
      topic: w.topic,
      address: w.address,
    }));
  }

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after"));
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        // ignore body read errors
      }
      throw new ShopifyApiError(
        res.status,
        `Shopify ${res.status} on ${url}: ${detail}`,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      );
    }
    return res;
  }
}

/**
 * Extract the `page_info` cursor for the NEXT page from Shopify's `Link` header,
 * which looks like: `<https://…?page_info=abc&limit=250>; rel="next"`.
 * Returns null when there is no next page.
 */
export function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) {
      try {
        return new URL(m[1]).searchParams.get("page_info");
      } catch {
        return null;
      }
    }
  }
  return null;
}
