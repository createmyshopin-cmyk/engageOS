export type ZapierIntegrationStatus = "connected" | "disconnected";

export interface ZapierIntegration {
  id: string;
  business_id: string;
  status: ZapierIntegrationStatus;
  zapier_account_label: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MerchantApiKey {
  id: string;
  business_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ZapierHookSubscription {
  id: string;
  business_id: string;
  hook_url: string;
  event_name: string;
  is_active: boolean;
  failure_count: number;
  last_delivery_at: string | null;
  created_at: string;
}

export interface ZapierIntegrationPublic {
  status: ZapierIntegrationStatus;
  apiKeyPrefix: string | null;
  activeSubscriptions: number;
  connectedAt: string | null;
  zapierAccountLabel: string | null;
}

export interface ZapierHookPublic {
  id: string;
  eventName: string;
  isActive: boolean;
  lastDeliveryAt: string | null;
  createdAt: string;
}
