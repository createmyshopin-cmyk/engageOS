// Universal Marketing Tracking Engine — core types.
// Client-safe: no server-only imports. These types are shared by the
// browser engine, the providers, the merchant settings UI, and the
// server-side config resolver.

/** The 8 launch providers. Must match the `tracking_provider` enum in 0033. */
export type ProviderKey =
  | "meta_pixel"
  | "gtm"
  | "ga4"
  | "clarity"
  | "microsoft_ads"
  | "tiktok"
  | "linkedin"
  | "pinterest";

export const PROVIDER_KEYS: readonly ProviderKey[] = [
  "meta_pixel",
  "gtm",
  "ga4",
  "clarity",
  "microsoft_ads",
  "tiktok",
  "linkedin",
  "pinterest",
] as const;

/**
 * Canonical customer-journey events. Providers map these onto their own
 * native event vocabulary. Adding a new event here is safe — providers that
 * don't map it simply ignore it.
 */
export type TrackingEventName =
  | "page_view"
  | "landing_viewed"
  | "qr_scan"
  | "campaign_viewed"
  | "registration_started"
  | "registration_completed"
  | "scratch_started"
  | "scratch_completed"
  | "reward_won"
  | "coupon_generated"
  | "coupon_viewed"
  | "coupon_redeemed"
  | "redirect_clicked"
  | "campaign_completed"
  | "whatsapp_cta_clicked"
  | "shop_now_clicked"
  | "repeat_visit";

/** One resolved provider config as returned by resolve_campaign_tracking. */
export interface TrackingConfig {
  provider: ProviderKey;
  providerId: string;
}

/**
 * Ambient campaign/merchant context attached to every event. Contains only
 * public campaign display data — never odds, inventory, or secrets.
 */
export interface TrackingContext {
  campaignId: string;
  campaignName: string;
  merchantId: string;
  merchantName: string;
  trafficSource: string;
  deviceType: "mobile" | "tablet" | "desktop";
}

/** Per-event dynamic data (reward name, coupon id, etc.). All optional. */
export interface TrackingPayload {
  rewardName?: string;
  couponId?: string;
  couponType?: string;
  prizeType?: string;
  value?: number;
  currency?: string;
  destination?: string;
  [key: string]: unknown;
}
