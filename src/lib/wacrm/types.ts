// Wire types for the wacrm Public API (/api/v1) — see wacrm/docs/public-api.md.
// EngageOS never mirrors CRM data; these are pass-through shapes only.

export interface WacrmTag {
  id: string;
  name: string;
  color: string | null;
}

export interface WacrmContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  avatar_url: string | null;
  tags: WacrmTag[];
  created_at: string;
  updated_at: string;
}

export interface WacrmConversation {
  id: string;
  status: "open" | "pending" | "closed";
  contact: WacrmContact | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface WacrmMessage {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  whatsapp_message_id: string | null;
  content_type?: string | null;
  content_text?: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface WacrmSendMessageResult {
  message_id: string;
  whatsapp_message_id: string;
  conversation_id: string;
  contact_id: string;
  contact_created: boolean;
}

export interface WacrmBroadcastLaunch {
  broadcast_id: string;
  status: string;
  total_recipients: number;
  accepted: number;
  rejected: number;
}

export interface WacrmBroadcastStatus {
  id?: string;
  status: string;
  total_recipients?: number;
  sent_count?: number;
  delivered_count?: number;
  read_count?: number;
  failed_count?: number;
  [key: string]: unknown;
}

export interface WacrmMe {
  account: { id: string; name: string };
  key: { id: string; scopes: string[] };
}

export interface WacrmWebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  is_active?: boolean;
  secret?: string; // returned exactly once, on create
}

export interface WacrmPage<T> {
  data: T[];
  next_cursor: string | null;
}

/** Outbound webhook delivery envelope (wacrm → EngageOS). */
export interface WacrmWebhookEvent {
  id: string;
  event: "message.received" | "message.status_updated" | "conversation.created";
  occurred_at: string;
  account_id: string;
  data: Record<string, unknown>;
}

/** Scopes the EngageOS integration key needs. */
export const REQUIRED_SCOPES = [
  "messages:send",
  "messages:read",
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "broadcasts:send",
  "webhooks:manage",
] as const;

/** Row shape of business_integrations (secrets stay encrypted). */
export interface WacrmIntegration {
  id: string;
  business_id: string;
  provider: "wacrm";
  base_url: string;
  api_key_enc: string;
  api_key_last4: string;
  account_id: string;
  account_name: string | null;
  webhook_id: string | null;
  webhook_secret_enc: string | null;
  coupon_template_name: string | null;
  coupon_template_language: string;
  auto_send_coupons: boolean;
  status: "connected" | "error" | "disconnected";
  last_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}
