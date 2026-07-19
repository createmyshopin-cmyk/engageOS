export type GoogleSheetsIntegrationStatus = "connected" | "disconnected";

export type GoogleSheetsFeedType =
  | "all_customers"
  | "new_customers"
  | "reward_customers"
  | "tag"
  | "campaign"
  | "campaigns_summary"
  | "shopify_codes";

export interface GoogleSheetsFeedConfig {
  joinedDays?: number;
}

export interface GoogleSheetsIntegration {
  id: string;
  business_id: string;
  api_key_hash: string;
  api_key_prefix: string;
  status: GoogleSheetsIntegrationStatus;
  spreadsheet_url: string | null;
  webapp_url: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleSheetsFeed {
  id: string;
  business_id: string;
  feed_type: GoogleSheetsFeedType;
  feed_key: string;
  tab_name: string;
  campaign_id: string | null;
  tag_id: string | null;
  config: GoogleSheetsFeedConfig;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GoogleSheetsFeedPublic {
  id: string;
  feedType: GoogleSheetsFeedType;
  feedKey: string;
  tabName: string;
  campaignId: string | null;
  tagId: string | null;
  config: GoogleSheetsFeedConfig;
  enabled: boolean;
  sortOrder: number;
}

export interface GoogleSheetsTagOption {
  id: string;
  name: string;
  color: string | null;
}

export interface GoogleSheetsCampaignOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface GoogleSheetsIntegrationPublic {
  status: GoogleSheetsIntegrationStatus;
  apiKeyPrefix: string;
  spreadsheetUrl: string | null;
  webappUrl: string | null;
  lastSyncAt: string | null;
  connectedAt: string;
}

export interface GoogleSheetsFeedInput {
  feedType: GoogleSheetsFeedType;
  tabName: string;
  campaignId?: string | null;
  tagId?: string | null;
  config?: GoogleSheetsFeedConfig;
  enabled?: boolean;
}
