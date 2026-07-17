import "server-only";
import type {
  WatiBroadcastOverview,
  WatiChannel,
  WatiChannelsResponse,
  WatiCustomParam,
  WatiSendResponse,
  WatiTemplate,
  WatiTemplatesResponse,
} from "@/lib/wati/types";

/**
 * Thin HTTP client for the WATI Public API v3 (/api/ext/v3/…).
 *
 * WATI uses Bearer token auth against a per-tenant host, e.g.
 *   https://live-mt-server.wati.io/{tenantId}
 * (older accounts: https://live-server-xxxx.wati.io). The caller passes
 * whatever base URL WATI shows on the account's API page; we normalise
 * the trailing slash and append the v3 path.
 *
 * Unlike the wacrm client (a local DB shim), this talks to WATI over the
 * network. Every non-2xx surfaces as a WatiApiError so route handlers can
 * map status → a clear merchant-facing message.
 */

export class WatiApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "WatiApiError";
  }
}

export class WatiClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiToken: string
  ) {
    // Drop trailing slashes; the WATI docs sometimes include the tenant
    // id as a path segment, which we keep verbatim.
    this.base = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.base}/api/ext/v3${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      throw new WatiApiError(
        0,
        `Could not reach WATI at ${this.base}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!res.ok) {
      let message = `WATI API error: ${res.status}`;
      try {
        const data = (await res.json()) as {
          message?: string;
          error?: string | { message?: string };
        };
        const detail =
          data.message ??
          (typeof data.error === "string" ? data.error : data.error?.message);
        if (detail) message = detail;
      } catch {
        // non-JSON body — keep the status-code fallback
      }
      throw new WatiApiError(res.status, message);
    }

    // Some endpoints (e.g. a 204) may carry no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** GET /channels — used to verify credentials and identify the number. */
  async getChannels(pageNumber = 1, pageSize = 100): Promise<WatiChannel[]> {
    const data = await this.request<WatiChannelsResponse>(
      "GET",
      `/channels?page_number=${pageNumber}&page_size=${pageSize}`
    );
    return data.channels ?? [];
  }

  /** GET /messagetemplates — approved templates for the template picker. */
  async getTemplates(pageNumber = 1, pageSize = 100): Promise<WatiTemplate[]> {
    const data = await this.request<WatiTemplatesResponse>(
      "GET",
      `/messagetemplates?page_number=${pageNumber}&page_size=${pageSize}`
    );
    return data.templates ?? [];
  }

  /**
   * GET /broadcasts/overview — account-wide campaign totals for the Analytics
   * tab. Best-effort: WATI only exposes account-level aggregates here (not
   * per-EngageOS-campaign), so this supplements our own campaign_events funnel
   * rather than replacing it. Returns null on any error so analytics still
   * render from our own log.
   */
  async getBroadcastOverview(): Promise<WatiBroadcastOverview | null> {
    try {
      return await this.request<WatiBroadcastOverview>("GET", `/broadcasts/overview`);
    } catch {
      return null;
    }
  }

  /**
   * POST /messagetemplates/send — send one approved template to a single
   * recipient. `broadcastName` is required by WATI (it groups the send);
   * `params` are the template body variables as {name,value} pairs.
   */
  async sendTemplate(args: {
    phoneNumber: string;
    templateName: string;
    broadcastName: string;
    params?: WatiCustomParam[];
    channel?: string | null;
  }): Promise<WatiSendResponse> {
    const res = await this.request<WatiSendResponse>(
      "POST",
      `/messagetemplates/send`,
      {
        channel: args.channel ?? null,
        template_name: args.templateName,
        broadcast_name: args.broadcastName,
        recipients: [
          {
            phone_number: args.phoneNumber,
            custom_params: args.params ?? [],
          },
        ],
      }
    );
    // WATI can return 200 with success:false + a per-recipient error.
    if (res.success === false) {
      const recipientErr = res.recipients?.[0]?.errors?.[0];
      throw new WatiApiError(422, recipientErr || res.error || "WATI rejected the message");
    }
    return res;
  }
}
