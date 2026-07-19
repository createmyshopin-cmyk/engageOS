import "server-only";

import type {
  WacrmBroadcastLaunch,
  WacrmBroadcastStatus,
  WacrmContact,
  WacrmConversation,
  WacrmMeResponse,
  WacrmMessage,
  WacrmSendMessageResult,
  WacrmWebhookRegistration,
} from "@/lib/wacrm/types";

const REQUEST_TIMEOUT_MS = 15_000;

export class WacrmApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WacrmApiError";
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
  meta?: { next_cursor?: string | null };
}

async function parseJson<T>(res: Response): Promise<ApiEnvelope<T>> {
  try {
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    throw new WacrmApiError(res.status, "parse_error", "Invalid JSON from WACRM");
  }
}

export class WacrmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.status === 204) {
        return undefined as T;
      }

      const json = await parseJson<T>(res);
      if (!res.ok || json.error) {
        const code = json.error?.code ?? "http_error";
        const message =
          json.error?.message ??
          (res.status === 429
            ? "WACRM rate limit exceeded. Try again shortly."
            : `WACRM request failed (${res.status})`);
        throw new WacrmApiError(res.status, code, message);
      }
      if (json.data === undefined) {
        throw new WacrmApiError(res.status, "empty_response", "Empty WACRM response");
      }
      return json.data;
    } catch (err) {
      if (err instanceof WacrmApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new WacrmApiError(408, "timeout", "WACRM request timed out");
      }
      throw new WacrmApiError(
        0,
        "network_error",
        err instanceof Error ? err.message : "Network error reaching WACRM"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  me(): Promise<WacrmMeResponse> {
    return this.request<WacrmMeResponse>("GET", "/api/v1/me");
  }

  upsertContact(input: {
    phone: string;
    name?: string;
    email?: string | null;
    tags?: string[];
  }): Promise<WacrmContact> {
    return this.request<WacrmContact>("POST", "/api/v1/contacts", input);
  }

  patchContact(
    contactId: string,
    input: { name?: string; email?: string | null; tags?: string[] }
  ): Promise<WacrmContact> {
    return this.request<WacrmContact>("PATCH", `/api/v1/contacts/${contactId}`, input);
  }

  sendTemplate(input: {
    to: string;
    templateName: string;
    language: string;
    params: string[];
  }): Promise<WacrmSendMessageResult> {
    return this.request<WacrmSendMessageResult>("POST", "/api/v1/messages", {
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: input.language,
        params: input.params,
      },
    });
  }

  registerWebhook(input: {
    url: string;
    events: string[];
  }): Promise<WacrmWebhookRegistration> {
    return this.request<WacrmWebhookRegistration>("POST", "/api/v1/webhooks", input);
  }

  deleteWebhook(webhookId: string): Promise<void> {
    return this.request<void>("DELETE", `/api/v1/webhooks/${webhookId}`);
  }

  private buildQuery(params?: Record<string, string | number | undefined | null>): string {
    if (!params) return "";
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      qs.set(key, String(value));
    }
    const s = qs.toString();
    return s ? `?${s}` : "";
  }

  private async requestList<T>(
    path: string,
    params?: Record<string, string | number | undefined | null>
  ): Promise<{ items: T[]; nextCursor: string | null }> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${path}${this.buildQuery(params)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      const json = await parseJson<T[]>(res);
      if (!res.ok || json.error) {
        throw new WacrmApiError(
          res.status,
          json.error?.code ?? "http_error",
          json.error?.message ?? `WACRM request failed (${res.status})`
        );
      }
      return {
        items: json.data ?? [],
        nextCursor: json.meta?.next_cursor ?? null,
      };
    } catch (err) {
      if (err instanceof WacrmApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new WacrmApiError(408, "timeout", "WACRM request timed out");
      }
      throw new WacrmApiError(
        0,
        "network_error",
        err instanceof Error ? err.message : "Network error reaching WACRM"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  listContacts(params?: {
    limit?: number;
    cursor?: string;
    search?: string;
    tag?: string;
  }): Promise<{ items: WacrmContact[]; nextCursor: string | null }> {
    return this.requestList<WacrmContact>("/api/v1/contacts", params);
  }

  getContact(id: string): Promise<WacrmContact> {
    return this.request<WacrmContact>("GET", `/api/v1/contacts/${id}`);
  }

  listConversations(params?: {
    limit?: number;
    cursor?: string;
    status?: string;
    contact_id?: string;
  }): Promise<{ items: WacrmConversation[]; nextCursor: string | null }> {
    return this.requestList<WacrmConversation>("/api/v1/conversations", params);
  }

  getConversation(id: string): Promise<WacrmConversation> {
    return this.request<WacrmConversation>("GET", `/api/v1/conversations/${id}`);
  }

  listMessages(
    conversationId: string,
    params?: { limit?: number; cursor?: string }
  ): Promise<{ items: WacrmMessage[]; nextCursor: string | null }> {
    return this.requestList<WacrmMessage>(
      `/api/v1/conversations/${conversationId}/messages`,
      params
    );
  }

  sendText(input: {
    to: string;
    text: string;
    replyToMessageId?: string;
  }): Promise<WacrmSendMessageResult> {
    return this.request<WacrmSendMessageResult>("POST", "/api/v1/messages", {
      to: input.to,
      type: "text",
      text: input.text,
      ...(input.replyToMessageId
        ? { reply_to_message_id: input.replyToMessageId }
        : {}),
    });
  }

  launchBroadcast(input: {
    name: string;
    template_name: string;
    template_language: string;
    recipients: { to: string; params?: string[] }[];
  }): Promise<WacrmBroadcastLaunch> {
    return this.request<WacrmBroadcastLaunch>("POST", "/api/v1/broadcasts", input);
  }

  getBroadcast(id: string): Promise<WacrmBroadcastStatus> {
    return this.request<WacrmBroadcastStatus>("GET", `/api/v1/broadcasts/${id}`);
  }
}
