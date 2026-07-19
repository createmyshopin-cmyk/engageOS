import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import type {
  GoogleSheetsFeed,
  GoogleSheetsFeedInput,
  GoogleSheetsFeedPublic,
  GoogleSheetsFeedType,
} from "@/lib/google-sheets/types";

function feedKeyFor(input: GoogleSheetsFeedInput): string {
  switch (input.feedType) {
    case "all_customers":
      return "all_customers";
    case "new_customers":
      return `new_customers:${input.config?.joinedDays ?? 7}`;
    case "reward_customers":
      return "reward_customers";
    case "campaigns_summary":
      return "campaigns_summary";
    case "shopify_codes":
      return "shopify_codes";
    case "tag":
      return `tag:${input.tagId}`;
    case "campaign":
      return `campaign:${input.campaignId}`;
  }
}

function toPublic(row: GoogleSheetsFeed): GoogleSheetsFeedPublic {
  return {
    id: row.id,
    feedType: row.feed_type,
    feedKey: row.feed_key,
    tabName: row.tab_name,
    campaignId: row.campaign_id,
    tagId: row.tag_id,
    config: row.config ?? {},
    enabled: row.enabled,
    sortOrder: row.sort_order,
  };
}

export const DEFAULT_FEEDS: GoogleSheetsFeedInput[] = [
  { feedType: "all_customers", tabName: "Customers", enabled: true },
  { feedType: "new_customers", tabName: "New Customers 7d", config: { joinedDays: 7 }, enabled: true },
  { feedType: "reward_customers", tabName: "Reward Customers", enabled: true },
  { feedType: "campaigns_summary", tabName: "Campaigns", enabled: true },
  { feedType: "shopify_codes", tabName: "Shopify Codes", enabled: true },
];

export async function listFeeds(businessId: string): Promise<GoogleSheetsFeedPublic[]> {
  const { data, error } = await supabaseAdmin()
    .from("google_sheets_feeds")
    .select("*")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`listFeeds failed: ${error.message}`);
  return ((data as GoogleSheetsFeed[]) ?? []).map(toPublic);
}

export async function listEnabledFeeds(businessId: string): Promise<GoogleSheetsFeedPublic[]> {
  const feeds = await listFeeds(businessId);
  return feeds.filter((f) => f.enabled);
}

export async function replaceFeeds(
  businessId: string,
  inputs: GoogleSheetsFeedInput[]
): Promise<GoogleSheetsFeedPublic[]> {
  for (const input of inputs) {
    if (input.feedType === "tag" && !input.tagId) {
      throw new Error("tagId is required for tag feeds");
    }
    if (input.feedType === "campaign" && !input.campaignId) {
      throw new Error("campaignId is required for campaign feeds");
    }
  }

  const now = new Date().toISOString();
  const rows = inputs.map((input, index) => ({
    business_id: businessId,
    feed_type: input.feedType,
    feed_key: feedKeyFor(input),
    tab_name: input.tabName.slice(0, 100),
    campaign_id: input.campaignId ?? null,
    tag_id: input.tagId ?? null,
    config: input.config ?? {},
    enabled: input.enabled ?? true,
    sort_order: index,
    updated_at: now,
  }));

  const { error: delError } = await supabaseAdmin()
    .from("google_sheets_feeds")
    .delete()
    .eq("business_id", businessId);
  if (delError) throw new Error(`replaceFeeds delete failed: ${delError.message}`);

  if (rows.length === 0) return [];

  const { data, error } = await supabaseAdmin()
    .from("google_sheets_feeds")
    .insert(rows)
    .select("*");
  if (error) throw new Error(`replaceFeeds insert failed: ${error.message}`);
  return ((data as GoogleSheetsFeed[]) ?? []).map(toPublic);
}

export async function seedDefaultFeeds(businessId: string): Promise<GoogleSheetsFeedPublic[]> {
  const existing = await listFeeds(businessId);
  if (existing.length > 0) return existing;
  return replaceFeeds(businessId, DEFAULT_FEEDS);
}

export async function listTagsForBusiness(
  businessId: string
): Promise<{ id: string; name: string; color: string | null }[]> {
  const { data, error } = await supabaseAdmin()
    .from("customer_tags")
    .select("id, name, color")
    .eq("business_id", businessId)
    .order("name", { ascending: true });
  if (error) throw new Error(`listTagsForBusiness failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string; color: string | null }[];
}

export async function listCampaignsForBusiness(
  businessId: string
): Promise<{ id: string; name: string; slug: string; status: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .select("id, name, slug, status")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCampaignsForBusiness failed: ${error.message}`);
  return (data ?? []) as { id: string; name: string; slug: string; status: string }[];
}

export function buildExportQuery(feed: GoogleSheetsFeedPublic): string {
  const params = new URLSearchParams({ feed: feed.feedType });
  if (feed.feedType === "new_customers") {
    const days = feed.config.joinedDays ?? 7;
    params.set("joined", days === 30 ? "30d" : days === 90 ? "90d" : "7d");
  }
  if (feed.feedType === "tag" && feed.tagId) params.set("tagId", feed.tagId);
  if (feed.feedType === "campaign" && feed.campaignId) {
    params.set("campaignId", feed.campaignId);
  }
  return params.toString();
}

export function feedTypeLabel(type: GoogleSheetsFeedType): string {
  switch (type) {
    case "all_customers":
      return "All Customers";
    case "new_customers":
      return "New Customers";
    case "reward_customers":
      return "Reward Customers";
    case "tag":
      return "Tag";
    case "campaign":
      return "Campaign";
    case "campaigns_summary":
      return "Campaigns Summary";
    case "shopify_codes":
      return "Shopify Codes";
  }
}
