export type WacrmIntegrationStatus = "connected" | "error" | "disconnected";

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
  status: WacrmIntegrationStatus;
  last_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WacrmMeResponse {
  account: { id: string; name: string };
  key: { id: string; scopes: string[] };
}

export interface WacrmContact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  tags: { id: string; name: string; color: string | null }[];
  created_at: string;
  updated_at: string;
}

export interface WacrmSendMessageResult {
  message_id: string;
  whatsapp_message_id: string;
  conversation_id: string;
  contact_id: string;
  contact_created: boolean;
}

export interface WacrmWebhookRegistration {
  id: string;
  url: string;
  events: string[];
  secret: string;
}

export interface WacrmConversation {
  id: string;
  status: "open" | "pending" | "closed";
  contact: WacrmContact;
  last_message_at: string | null;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface WacrmMessage {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  whatsapp_message_id: string | null;
  content_type: string;
  text: string | null;
  created_at: string;
}

export interface WacrmBroadcastLaunch {
  broadcast_id: string;
  status: string;
  total_recipients: number;
  accepted: number;
  rejected: number;
}

export interface WacrmBroadcastStatus {
  id: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
}

export const WACRM_REQUIRED_SCOPES = [
  "messages:send",
  "messages:read",
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "broadcasts:send",
  "webhooks:manage",
] as const;
