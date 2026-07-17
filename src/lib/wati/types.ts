// Wire types for the WATI Public API v3 (/api/ext/v3/…) and the local
// wati_integrations row. See https://docs.wati.io/reference/introduction
// EngageOS never mirrors WATI data; these are pass-through shapes only.

/** GET /api/ext/v3/channels → channels[] (ChannelDto). */
export interface WatiChannel {
  id: string;
  name: string;
  /** Platform, e.g. "Whatsapp". */
  channel: string;
}

export interface WatiChannelsResponse {
  channels: WatiChannel[];
}

/** One template from GET /api/ext/v3/messagetemplates. */
export interface WatiTemplate {
  id: string;
  name: string;
  status: string; // e.g. "APPROVED"
  category?: string | null;
  language_option?: { key?: string; value?: string; text?: string } | null;
}

export interface WatiTemplatesResponse {
  templates: WatiTemplate[];
  page_number: number;
  page_size: number;
  total: number;
}

/** One {name,value} substitution for a template body variable. */
export interface WatiCustomParam {
  name: string;
  value: string;
}

/** Per-recipient result inside a send response. */
export interface WatiSendRecipientResult {
  local_message_id?: string | null;
  phone_number?: string | null;
  errors?: string[] | null;
}

/** POST /api/ext/v3/messagetemplates/send → response. */
export interface WatiSendResponse {
  success: boolean;
  broadcast_id?: string | null;
  error?: string | null;
  recipients?: WatiSendRecipientResult[] | null;
}

/**
 * GET /api/ext/v3/broadcasts/overview → account-wide campaign totals.
 * WATI's field names vary a little across accounts, so every field is
 * optional and normalised by the client.
 */
export interface WatiBroadcastOverview {
  total?: number | null;
  sent?: number | null;
  delivered?: number | null;
  read?: number | null;
  failed?: number | null;
  [key: string]: unknown;
}

/** Row shape of wati_integrations (token stays encrypted). */
export interface WatiIntegration {
  id: string;
  business_id: string;
  provider: "wati";
  base_url: string;
  api_token_enc: string;
  api_token_last4: string;
  channel_id: string | null;
  channel_name: string | null;
  display_name: string | null;
  coupon_template_name: string | null;
  coupon_template_language: string;
  auto_send_coupons: boolean;
  participation_template_name: string | null;
  participation_template_language: string;
  auto_send_participation: boolean;
  /** Per-tenant opaque bearer secret carried in the inbound webhook URL (?token=…). */
  webhook_token: string;
  status: "connected" | "error" | "disconnected";
  last_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}
