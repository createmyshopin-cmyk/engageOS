import "server-only";
import type {
  WacrmBroadcastLaunch,
  WacrmBroadcastStatus,
  WacrmContact,
  WacrmConversation,
  WacrmMe,
  WacrmMessage,
  WacrmPage,
  WacrmSendMessageResult,
  WacrmWebhookEndpoint,
} from "@/lib/wacrm/types";

/**
 * Thin, typed client for the wacrm Public API (/api/v1). This is the ONLY
 * module that talks HTTP to wacrm — everything above it (sync engine,
 * merchant adapter routes) goes through this client, and the merchant UI
 * never calls wacrm directly.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export class WacrmApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WacrmApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export class WacrmClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      throw new WacrmApiError(
        0,
        "network_error",
        `wacrm unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // 204s / empty bodies fall through
    }

    if (!res.ok) {
      throw new WacrmApiError(
        res.status,
        json?.error?.code ?? "internal",
        json?.error?.message ?? `wacrm returned HTTP ${res.status}`
      );
    }
    return json as T;
  }

  private async page<T>(
    path: string,
    query: Record<string, string | number | undefined>
  ): Promise<WacrmPage<T>> {
    const json = await this.request<{ data: T[]; meta?: { next_cursor: string | null } }>(
      path,
      { query }
    );
    return { data: json.data ?? [], next_cursor: json.meta?.next_cursor ?? null };
  }

  // ---------- Identity ----------

  me(): Promise<{ data: WacrmMe }> {
    return this.request("/me");
  }

  // ---------- Messages ----------

  sendText(to: string, text: string, replyToMessageId?: string) {
    return this.request<{ data: WacrmSendMessageResult }>("/messages", {
      method: "POST",
      body: {
        to,
        type: "text",
        text,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      },
    });
  }

  sendTemplate(
    to: string,
    template: { name: string; language: string; params?: string[] }
  ) {
    return this.request<{ data: WacrmSendMessageResult }>("/messages", {
      method: "POST",
      body: { to, type: "template", template },
    });
  }

  // ---------- Contacts ----------

  listContacts(query: { search?: string; tag?: string; cursor?: string; limit?: number } = {}) {
    return this.page<WacrmContact>("/contacts", query);
  }

  /** Find-or-create by phone (200 existing / 201 created). */
  upsertContact(contact: {
    phone: string;
    name?: string;
    email?: string;
    company?: string;
    tags?: string[];
  }) {
    return this.request<{ data: WacrmContact }>("/contacts", {
      method: "POST",
      body: contact,
    });
  }

  getContact(id: string) {
    return this.request<{ data: WacrmContact }>(`/contacts/${id}`);
  }

  /** PATCH updates only sent fields; `tags` REPLACES the contact's tags. */
  updateContact(
    id: string,
    patch: { name?: string; email?: string; company?: string; tags?: string[] }
  ) {
    return this.request<{ data: WacrmContact }>(`/contacts/${id}`, {
      method: "PATCH",
      body: patch,
    });
  }

  // ---------- Conversations / Inbox ----------

  listConversations(
    query: { status?: string; contact_id?: string; cursor?: string; limit?: number } = {}
  ) {
    return this.page<WacrmConversation>("/conversations", query);
  }

  getConversation(id: string) {
    return this.request<{ data: WacrmConversation }>(`/conversations/${id}`);
  }

  listMessages(conversationId: string, query: { cursor?: string; limit?: number } = {}) {
    return this.page<WacrmMessage>(`/conversations/${conversationId}/messages`, query);
  }

  // ---------- Broadcasts ----------

  createBroadcast(body: {
    name: string;
    template_name: string;
    template_language: string;
    recipients: Array<{ to: string; params?: string[] }>;
  }) {
    return this.request<{ data: WacrmBroadcastLaunch }>("/broadcasts", {
      method: "POST",
      body,
    });
  }

  getBroadcast(id: string) {
    return this.request<{ data: WacrmBroadcastStatus }>(`/broadcasts/${id}`);
  }

  // ---------- Webhooks ----------

  registerWebhook(url: string, events: string[]) {
    return this.request<{ data: WacrmWebhookEndpoint }>("/webhooks", {
      method: "POST",
      body: { url, events },
    });
  }

  deleteWebhook(id: string) {
    return this.request<{ data: unknown }>(`/webhooks/${id}`, { method: "DELETE" });
  }

  reactivateWebhook(id: string) {
    return this.request<{ data: WacrmWebhookEndpoint }>(`/webhooks/${id}`, {
      method: "PATCH",
      body: { is_active: true },
    });
  }
}
