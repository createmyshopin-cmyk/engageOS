import "server-only";
import { adminClient } from "@/lib/db/rpc";
import { after } from "next/server";
import { resolveConversationByPhone } from "@/lib/wacrm/whatsapp/resolve-conversation";
import { sendMessageToConversation } from "@/lib/wacrm/whatsapp/send-message";
import { createBroadcast, deliverBroadcast } from "@/lib/wacrm/whatsapp/broadcast-core";
import { setContactTags } from "@/lib/wacrm/api/v1/contacts";
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

const REQUIRED_SCOPES = [
  "messages:send",
  "messages:read",
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "broadcasts:send",
  "webhooks:manage",
];

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

export class WacrmClient {
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string,
    readonly businessId?: string
  ) {}

  // ---------- Identity ----------

  async me(): Promise<{ data: WacrmMe }> {
    const { data: biz } = await adminClient()
      .from("businesses")
      .select("name")
      .eq("id", this.businessId)
      .maybeSingle();

    return {
      data: {
        account: {
          id: this.businessId || "",
          name: biz?.name || "Local Account",
        },
        key: {
          id: "local-integrated-key",
          scopes: REQUIRED_SCOPES,
        },
      },
    };
  }

  // ---------- Messages ----------

  async sendText(to: string, text: string, replyToMessageId?: string) {
    if (!this.businessId) throw new Error("businessId not configured in client");
    const resolved = await resolveConversationByPhone(
      adminClient(),
      this.businessId,
      to
    );

    const result = await sendMessageToConversation(
      adminClient(),
      this.businessId,
      {
        conversationId: resolved.conversationId,
        messageType: "text",
        contentText: text,
        replyToMessageId: replyToMessageId || null,
      }
    );

    return {
      data: {
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
        conversation_id: resolved.conversationId,
        contact_id: resolved.contactId,
        contact_created: resolved.contactCreated,
      } as unknown as WacrmSendMessageResult
    };
  }

  async sendTemplate(
    to: string,
    template: { name: string; language: string; params?: string[] }
  ) {
    if (!this.businessId) throw new Error("businessId not configured in client");
    const resolved = await resolveConversationByPhone(
      adminClient(),
      this.businessId,
      to
    );

    const result = await sendMessageToConversation(
      adminClient(),
      this.businessId,
      {
        conversationId: resolved.conversationId,
        messageType: "template",
        templateName: template.name,
        templateLanguage: template.language,
        templateParams: template.params,
      }
    );

    return {
      data: {
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
        conversation_id: resolved.conversationId,
        contact_id: resolved.contactId,
        contact_created: resolved.contactCreated,
      } as unknown as WacrmSendMessageResult
    };
  }

  // ---------- Contacts ----------

  async listContacts(query: { search?: string; tag?: string; cursor?: string; limit?: number } = {}): Promise<WacrmPage<WacrmContact>> {
    const limit = query.limit ?? 50;
    let dbQuery = adminClient()
      .from("contacts")
      .select("*, contact_tags(tags(*))")
      .eq("account_id", this.businessId);

    if (query.search) {
      dbQuery = dbQuery.or(`name.ilike.*${query.search}*,phone.ilike.*${query.search}*`);
    }

    if (query.tag) {
      dbQuery = dbQuery.eq("contact_tags.tag_id", query.tag);
    }

    dbQuery = dbQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (query.cursor) {
      try {
        const [createdAt, id] = JSON.parse(Buffer.from(query.cursor, "base64").toString());
        dbQuery = dbQuery.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
      } catch (e) {
        console.error("Failed to parse cursor:", e);
      }
    }

    const { data, error } = await dbQuery;
    if (error) throw new Error("Failed to list contacts: " + error.message);

    const hasNext = data.length > limit;
    const items = hasNext ? data.slice(0, limit) : data;
    let nextCursor: string | null = null;
    if (hasNext && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(JSON.stringify([lastItem.created_at, lastItem.id])).toString("base64");
    }

    return {
      data: items as unknown as WacrmContact[],
      next_cursor: nextCursor,
    };
  }

  async upsertContact(contact: {
    phone: string;
    name?: string;
    email?: string;
    company?: string;
    tags?: string[];
  }) {
    if (!this.businessId) throw new Error("businessId not configured in client");
    const { data: config } = await adminClient()
      .from("whatsapp_config")
      .select("user_id")
      .eq("account_id", this.businessId)
      .maybeSingle();
    const userId = config?.user_id || "00000000-0000-0000-0000-000000000000";

    const { data: existing } = await adminClient()
      .from("contacts")
      .select("id")
      .eq("account_id", this.businessId)
      .eq("phone", contact.phone)
      .maybeSingle();

    let res;
    if (existing) {
      res = await adminClient()
        .from("contacts")
        .update({
          name: contact.name,
          email: contact.email,
          company: contact.company,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      res = await adminClient()
        .from("contacts")
        .insert({
          account_id: this.businessId,
          user_id: userId,
          phone: contact.phone,
          name: contact.name,
          email: contact.email,
          company: contact.company,
        })
        .select()
        .single();
    }

    if (res.error) throw new Error("Failed to upsert contact: " + res.error.message);

    if (contact.tags) {
      await setContactTags(adminClient(), this.businessId, userId, res.data.id, contact.tags);
    }

    return { data: res.data as unknown as WacrmContact };
  }

  async getContact(id: string) {
    const { data, error } = await adminClient()
      .from("contacts")
      .select("*, contact_tags(tags(*))")
      .eq("account_id", this.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("getContact failed: " + error.message);
    return { data: data as unknown as WacrmContact };
  }

  async updateContact(
    id: string,
    patch: { name?: string; email?: string; company?: string; tags?: string[] }
  ) {
    if (!this.businessId) throw new Error("businessId not configured in client");
    const { data, error } = await adminClient()
      .from("contacts")
      .update({
        name: patch.name,
        email: patch.email,
        company: patch.company,
        updated_at: new Date().toISOString(),
      })
      .eq("account_id", this.businessId)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error("updateContact failed: " + error.message);

    if (patch.tags) {
      let userId = "00000000-0000-0000-0000-000000000000";
      try {
        const { data: config } = await adminClient()
          .from("whatsapp_config")
          .select("user_id")
          .eq("account_id", this.businessId)
          .maybeSingle();
        if (config?.user_id) userId = config.user_id;
      } catch {}
      await setContactTags(adminClient(), this.businessId, userId, id, patch.tags);
    }

    return { data: data as unknown as WacrmContact };
  }

  // ---------- Conversations / Inbox ----------

  async listConversations(
    query: { status?: string; contact_id?: string; cursor?: string; limit?: number } = {}
  ): Promise<WacrmPage<WacrmConversation>> {
    const limit = query.limit ?? 50;
    let dbQuery = adminClient()
      .from("conversations")
      .select("*, contacts(*)")
      .eq("account_id", this.businessId);

    if (query.status) {
      dbQuery = dbQuery.eq("status", query.status);
    }
    if (query.contact_id) {
      dbQuery = dbQuery.eq("contact_id", query.contact_id);
    }

    dbQuery = dbQuery
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (query.cursor) {
      try {
        const [lastMessageAt, id] = JSON.parse(Buffer.from(query.cursor, "base64").toString());
        dbQuery = dbQuery.or(`last_message_at.lt.${lastMessageAt},and(last_message_at.eq.${lastMessageAt},id.lt.${id})`);
      } catch (e) {
        console.error("Failed to parse cursor:", e);
      }
    }

    const { data, error } = await dbQuery;
    if (error) throw new Error("listConversations failed: " + error.message);

    const hasNext = data.length > limit;
    const items = hasNext ? data.slice(0, limit) : data;
    let nextCursor: string | null = null;
    if (hasNext && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(JSON.stringify([lastItem.last_message_at, lastItem.id])).toString("base64");
    }

    return {
      data: items as unknown as WacrmConversation[],
      next_cursor: nextCursor,
    };
  }

  async getConversation(id: string) {
    const { data, error } = await adminClient()
      .from("conversations")
      .select("*, contacts(*)")
      .eq("account_id", this.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("getConversation failed: " + error.message);
    return { data: data as unknown as WacrmConversation };
  }

  async listMessages(conversationId: string, query: { cursor?: string; limit?: number } = {}): Promise<WacrmPage<WacrmMessage>> {
    const limit = query.limit ?? 50;
    let dbQuery = adminClient()
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId);

    dbQuery = dbQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (query.cursor) {
      try {
        const [createdAt, id] = JSON.parse(Buffer.from(query.cursor, "base64").toString());
        dbQuery = dbQuery.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
      } catch (e) {
        console.error("Failed to parse cursor:", e);
      }
    }

    const { data, error } = await dbQuery;
    if (error) throw new Error("listMessages failed: " + error.message);

    const hasNext = data.length > limit;
    const items = hasNext ? data.slice(0, limit) : data;
    let nextCursor: string | null = null;
    if (hasNext && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = Buffer.from(JSON.stringify([lastItem.created_at, lastItem.id])).toString("base64");
    }

    return {
      data: items as unknown as WacrmMessage[],
      next_cursor: nextCursor,
    };
  }

  // ---------- Broadcasts ----------

  async createBroadcast(body: {
    name: string;
    template_name: string;
    template_language: string;
    recipients: Array<{ to: string; params?: string[] }>;
  }) {
    if (!this.businessId) throw new Error("businessId not configured in client");
    const { data: config } = await adminClient()
      .from("whatsapp_config")
      .select("user_id")
      .eq("account_id", this.businessId)
      .maybeSingle();
    const userId = config?.user_id || "00000000-0000-0000-0000-000000000000";

    const plan = await createBroadcast(adminClient(), this.businessId, userId, {
      name: body.name,
      templateName: body.template_name,
      templateLanguage: body.template_language,
      recipients: body.recipients.map((r) => ({
        to: r.to,
        params: r.params,
      })),
    });

    after(() => deliverBroadcast(adminClient(), plan));

    return {
      data: {
        broadcast_id: plan.broadcastId,
        status: "sending",
        total_recipients: plan.planned.length,
        accepted: plan.planned.length,
        rejected: plan.rejected,
      } as unknown as WacrmBroadcastLaunch
    };
  }

  async getBroadcast(id: string) {
    const { data, error } = await adminClient()
      .from("whatsapp_broadcasts")
      .select("*")
      .eq("business_id", this.businessId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error("getBroadcast failed: " + error.message);
    return { data: data as unknown as WacrmBroadcastStatus };
  }

  // ---------- Webhooks ----------

  async registerWebhook(url: string, events: string[]) {
    return {
      data: {
        id: "local-integrated-webhook",
        url,
        events,
        is_active: true,
        secret: "local_webhook_secret",
      } as unknown as WacrmWebhookEndpoint
    };
  }

  async deleteWebhook(id: string) {
    return { data: {} };
  }

  async reactivateWebhook(id: string) {
    return {
      data: {
        id,
        is_active: true,
      } as unknown as WacrmWebhookEndpoint
    };
  }
}
