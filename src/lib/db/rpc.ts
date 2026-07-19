import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { CampaignDisplay, PlayResult, RedeemResult } from "@/lib/types";
import type { ProviderKey, TrackingConfig } from "@/lib/tracking/types";
import { dispatchZapierEvent } from "@/lib/zapier/dispatch";

/**
 * Service-role client for RPCs. Server-only module — importing it from
 * client code fails the build via the "server-only" package.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Public campaign display data (names only — never odds or inventory).
 * Resolved by the (merchantSlug, campaignSlug) pair so the campaign is only
 * ever returned for its owning merchant.
 */
export async function getCampaignDisplay(
  merchantSlug: string,
  campaignSlug: string
): Promise<CampaignDisplay | null> {
  const { data, error } = await adminClient().rpc("campaign_display", {
    p_merchant_slug: merchantSlug,
    p_slug: campaignSlug,
  });
  if (error) throw new Error(`campaign_display failed: ${error.message}`);
  return (data as CampaignDisplay | null) ?? null;
}

/**
 * Resolve the effective marketing-tracking config for a live campaign
 * (business defaults ← campaign overrides). Returns only ENABLED providers'
 * PUBLIC pixel/tag IDs — never secrets. Best-effort: any failure yields an
 * empty list so tracking never blocks the customer page from rendering.
 */
export async function getCampaignTracking(
  merchantSlug: string,
  campaignSlug: string,
): Promise<TrackingConfig[]> {
  try {
    const { data, error } = await adminClient().rpc("resolve_campaign_tracking", {
      p_merchant_slug: merchantSlug,
      p_slug: campaignSlug,
    });
    if (error) {
      console.error(`resolve_campaign_tracking failed: ${error.message}`);
      return [];
    }
    const rows = (data as { provider: ProviderKey; provider_id: string }[] | null) ?? [];
    return rows
      .filter((r) => r.provider && r.provider_id)
      .map((r) => ({ provider: r.provider, providerId: r.provider_id }));
  } catch (err) {
    console.error("resolve_campaign_tracking threw:", err);
    return [];
  }
}

/**
 * Record a QR-scan funnel event (best-effort). Rate-limited and
 * deduplicated server-side, so a refresh doesn't double-count. Never
 * throws to the caller — a scan-logging failure must not block the
 * play page from rendering.
 */
export async function recordScan(
  merchantSlug: string,
  campaignSlug: string,
  ip: string,
  source = "direct"
): Promise<void> {
  try {
    const { error } = await adminClient().rpc("record_scan", {
      p_merchant_slug: merchantSlug,
      p_slug: campaignSlug,
      p_ip: ip,
      p_source: source,
    });
    if (error) console.error(`record_scan failed: ${error.message}`);
  } catch (err) {
    console.error("record_scan threw:", err);
  }
}

/** Execute a play. All invariants (limits, inventory, atomicity) live in SQL. */
export async function playCampaign(params: {
  merchantSlug: string;
  campaignSlug: string;
  phone: string;
  name: string;
  ip: string;
  source?: string;
  deviceId?: string;
}): Promise<PlayResult> {
  const { data, error } = await adminClient().rpc("play_campaign", {
    p_merchant_slug: params.merchantSlug,
    p_campaign_slug: params.campaignSlug,
    p_phone: params.phone,
    p_name: params.name,
    p_ip: params.ip,
    p_source: params.source ?? "direct",
    p_device_id: params.deviceId ?? null,
  });
  if (error) throw new Error(`play_campaign failed: ${error.message}`);
  return data as PlayResult;
}

/** Redeem a coupon for a specific business (staff PIN already verified). */
export async function redeemCoupon(params: {
  businessId: string;
  code: string;
}): Promise<RedeemResult> {
  const { data, error } = await adminClient().rpc("redeem_coupon", {
    p_business_id: params.businessId,
    p_code: params.code,
  });
  if (error) throw new Error(`redeem_coupon failed: ${error.message}`);
  return data as RedeemResult;
}

/**
 * Append a campaign event from a context that has no TenantRepository yet
 * (e.g. pre-session login, staff API routes). business_id / actor are still
 * supplied by trusted server code, never the client. Best-effort: a logging
 * failure is swallowed so it never blocks the underlying action.
 */
export async function recordCampaignEvent(params: {
  businessId: string;
  campaignId?: string | null;
  actorType: string;
  actorId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const { error } = await adminClient().rpc("record_campaign_event", {
      p_business_id: params.businessId,
      p_campaign_id: params.campaignId ?? null,
      p_actor_type: params.actorType,
      p_actor_id: params.actorId ?? null,
      p_event_type: params.eventType,
      p_metadata: params.metadata ?? {},
      p_ip_address: params.ip ?? null,
      p_user_agent: params.userAgent ?? null,
    });
    if (error) {
      console.error(`recordCampaignEvent(${params.eventType}) failed:`, error.message);
      return;
    }
    dispatchZapierEvent(params.businessId, params.eventType, {
      campaign_id: params.campaignId ?? null,
      actor_type: params.actorType,
      actor_id: params.actorId ?? null,
      ...(params.metadata ?? {}),
    });
  } catch (err) {
    console.error(`recordCampaignEvent(${params.eventType}) threw:`, err);
  }
}

export { adminClient };

/**
 * Record a Post Win redirect / reward-view experience event as the customer
 * actor. business_id is resolved server-side from the campaign so it can never
 * be spoofed by the client, and the event type is checked against an allow-list
 * of customer-safe experience events. Best-effort — never throws.
 */
const CUSTOMER_EXPERIENCE_EVENTS = new Set([
  "reward.viewed",
  "reward.claimed",
  "scratch.completed",
  "redirect.started",
  "redirect.opened",
  "redirect.completed",
  "redirect.cancelled",
]);

export async function recordExperienceEvent(params: {
  campaignId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  if (!CUSTOMER_EXPERIENCE_EVENTS.has(params.eventType)) return false;
  try {
    const supabase = adminClient();
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("business_id")
      .eq("id", params.campaignId)
      .maybeSingle<{ business_id: string }>();
    if (cErr || !campaign) return false;

    await recordCampaignEvent({
      businessId: campaign.business_id,
      campaignId: params.campaignId,
      actorType: "customer",
      actorId: null,
      eventType: params.eventType,
      metadata: params.metadata ?? {},
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });
    return true;
  } catch (err) {
    console.error("recordExperienceEvent threw:", err);
    return false;
  }
}
