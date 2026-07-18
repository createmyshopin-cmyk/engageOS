import { adminClient } from "@/lib/db/rpc";
import type { ProviderKey } from "@/lib/tracking/types";

/**
 * Integration-layer persistence for the marketing Tracking Engine. Every
 * helper is explicitly scoped by business_id / campaign_id so nothing can
 * cross a tenant boundary. Mirrors src/lib/wati/store.ts and stays OUT of
 * TenantRepository on purpose — the core repository is untouched.
 *
 * Writes go through the SECURITY DEFINER RPCs from migration 0033 (which
 * re-check ownership in SQL); reads are direct service-role selects filtered
 * by the caller's own business_id.
 */

export interface BusinessTrackingRow {
  provider: ProviderKey;
  enabled: boolean;
  provider_id: string | null;
  notes: string | null;
  status: "connected" | "error" | "disconnected";
  last_verified_at: string | null;
}

export async function listBusinessTracking(
  businessId: string,
): Promise<BusinessTrackingRow[]> {
  const { data, error } = await adminClient()
    .from("business_tracking_integrations")
    .select("provider, enabled, provider_id, notes, status, last_verified_at")
    .eq("business_id", businessId);
  if (error) throw new Error(`listBusinessTracking failed: ${error.message}`);
  return (data as BusinessTrackingRow[] | null) ?? [];
}

export async function upsertBusinessTracking(params: {
  businessId: string;
  provider: ProviderKey;
  enabled: boolean;
  providerId: string | null;
  notes: string | null;
  status: "connected" | "error" | "disconnected";
}): Promise<void> {
  const { error } = await adminClient().rpc("merchant_upsert_tracking_integration", {
    p_business_id: params.businessId,
    p_provider: params.provider,
    p_enabled: params.enabled,
    p_provider_id: params.providerId,
    p_notes: params.notes,
    p_status: params.status,
  });
  if (error) throw new Error(`upsertBusinessTracking failed: ${error.message}`);
}

export interface CampaignTrackingOverrideRow {
  provider: ProviderKey;
  enabled: boolean;
  provider_id: string | null;
}

export async function getCampaignTrackingConfig(
  businessId: string,
  campaignId: string,
): Promise<{ useDefault: boolean; overrides: CampaignTrackingOverrideRow[] } | null> {
  const admin = adminClient();
  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .select("tracking_use_default")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .maybeSingle<{ tracking_use_default: boolean }>();
  if (cErr) throw new Error(`getCampaignTrackingConfig failed: ${cErr.message}`);
  if (!campaign) return null; // not this tenant's campaign

  const { data: overrides, error: oErr } = await admin
    .from("campaign_tracking_overrides")
    .select("provider, enabled, provider_id")
    .eq("campaign_id", campaignId);
  if (oErr) throw new Error(`getCampaignTrackingConfig overrides failed: ${oErr.message}`);

  return {
    useDefault: campaign.tracking_use_default,
    overrides: (overrides as CampaignTrackingOverrideRow[] | null) ?? [],
  };
}

export async function setCampaignTrackingMode(params: {
  businessId: string;
  campaignId: string;
  useDefault: boolean;
}): Promise<void> {
  const { error } = await adminClient().rpc("merchant_set_campaign_tracking_mode", {
    p_business_id: params.businessId,
    p_campaign_id: params.campaignId,
    p_use_default: params.useDefault,
  });
  if (error) throw new Error(`setCampaignTrackingMode failed: ${error.message}`);
}

export async function upsertCampaignTrackingOverride(params: {
  businessId: string;
  campaignId: string;
  provider: ProviderKey;
  enabled: boolean;
  providerId: string | null;
}): Promise<void> {
  const { error } = await adminClient().rpc("merchant_upsert_campaign_tracking_override", {
    p_business_id: params.businessId,
    p_campaign_id: params.campaignId,
    p_provider: params.provider,
    p_enabled: params.enabled,
    p_provider_id: params.providerId,
  });
  if (error) throw new Error(`upsertCampaignTrackingOverride failed: ${error.message}`);
}
