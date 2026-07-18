// Database row types and RPC result types.
// Mirror of supabase/migrations — keep in sync manually.

export type MerchantRole = "owner" | "manager" | "staff";
export type MerchantStatus = "active" | "suspended";

export interface Merchant {
  id: string;
  business_id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: MerchantRole;
  status: MerchantStatus;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape stored in the signed session cookie (no sensitive fields). */
export interface MerchantSessionPayload {
  merchantId: string;
  businessId: string;
  name: string;
  email: string;
  role: MerchantRole;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  public_id: string;
  phone: string;
  city: string | null;
  logo_url: string | null;
  staff_pin: string;
  merchant_token: string;
  wa_messages_sent: number;
  wa_messages_quota: number;
  active: boolean;
  created_at: string;
}

export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";

export type CampaignType =
  | "scratch_win"
  | "spin_win"
  | "lucky_draw"
  | "quiz_challenge"
  | "collect_win"
  | "coupon_drop";

export interface Campaign {
  id: string;
  business_id: string;
  name: string;
  slug: string;
  headline: string;
  description: string | null;
  banner_url: string | null;
  logo_url: string | null;
  terms: string | null;
  coupon_prefix: string;
  status: CampaignStatus;
  campaign_type?: CampaignType;
  starts_at: string;
  ends_at: string;
  created_at: string;
  redirect_enabled?: boolean;
  redirect_delay?: RedirectDelay;
  redirect_destination_type?: RedirectDestinationType;
  redirect_url?: string | null;
  exp_preloader_enabled?: boolean;
  exp_preloader_duration?: PreloaderDuration;
  exp_confetti_enabled?: boolean;
  exp_sound_enabled?: boolean;
  exp_haptics_enabled?: boolean;
  exp_open_native_app?: boolean;
  exp_show_countdown?: boolean;
  exp_allow_skip?: boolean;
  exp_button_text?: string | null;
  exp_theme?: ExperienceTheme;
}

export type PreloaderDuration = 300 | 600 | 1000;

export type ExperienceTheme = "light" | "dark" | "brand";

/** Customer Experience settings, as surfaced by campaign_display. */
export interface ExperienceSettings {
  preloader_enabled: boolean;
  preloader_duration: PreloaderDuration;
  confetti_enabled: boolean;
  sound_enabled: boolean;
  haptics_enabled: boolean;
  open_native_app: boolean;
  show_countdown: boolean;
  allow_skip: boolean;
  button_text: string | null;
  theme: ExperienceTheme;
}

export type RedirectDelay = 0 | 3 | 5 | 10 | 15 | 30;

export type RedirectDestinationType =
  | "none"
  | "website"
  | "product"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "whatsapp"
  | "telegram"
  | "custom";

/** Post Win redirect settings, as surfaced by campaign_display. */
export interface RedirectSettings {
  enabled: boolean;
  delay: RedirectDelay;
  destination_type: RedirectDestinationType;
  url: string | null;
}

export type PrizeType =
  | "coupon"
  | "physical_gift"
  | "gift_voucher"
  | "lucky_draw"
  | "cashback"
  | "wallet_points";

export interface Prize {
  id: string;
  campaign_id: string;
  name: string;
  weight: number;
  total_quantity: number;
  won_count: number;
  expiry_days: number;
  prize_type: PrizeType;
  prize_value: number | null;
  is_fallback: boolean;
  image_url: string | null;
  background_color: string | null;
  description: string | null;
  badge: string | null;
  sort_order: number;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  phone: string;
  name: string;
  created_at: string;
}

export interface Play {
  id: string;
  campaign_id: string;
  business_id: string;
  customer_id: string;
  won: boolean;
  prize_id: string | null;
  created_at: string;
}

export type CouponStatus = "issued" | "redeemed" | "expired";
export type WaStatus = "pending" | "sent" | "failed";

export interface Coupon {
  id: string;
  business_id: string;
  campaign_id: string;
  prize_id: string;
  customer_id: string;
  play_id: string;
  code: string;
  prize_name: string;
  status: CouponStatus;
  wa_status: WaStatus;
  wa_attempts: number;
  expires_at: string;
  redeemed_at: string | null;
  created_at: string;
}

// ---------- RPC results ----------

export interface CampaignDisplayPrize {
  name: string;
  prize_type: PrizeType;
  image_url: string | null;
  background_color: string | null;
}

export interface CampaignDisplay {
  campaign_id: string;
  name: string;
  headline: string;
  business_name: string;
  logo_url: string | null;
  ends_at: string;
  prizes: CampaignDisplayPrize[];
  redirect?: RedirectSettings;
  experience?: ExperienceSettings;
}

export type PlayResult =
  | {
      status: "ok";
      won: true;
      prize_name: string;
      prize_type: PrizeType;
      prize_value: number | null;
      prize_image_url: string | null;
      prize_background_color: string | null;
      coupon_code: string;
      expires_at: string;
      /** Present for coupon_drop wins — used for opportunistic pool top-up. */
      campaign_id?: string;
      /** How the code was sourced: internal, a Shopify pool code, or fallback. */
      coupon_source?: "internal" | "shopify_pool" | "internal_fallback";
      /** True when the code is a unique Shopify discount to redeem online. */
      redeem_online?: boolean;
      /** Human-readable discount summary, e.g. "10% off" (reveal copy). */
      discount_summary?: string;
      /** The merchant's Shopify storefront URL to redeem at. */
      store_url?: string;
    }
  | { status: "ok"; won: false }
  | { status: "already_played" }
  | { status: "campaign_inactive" }
  | { status: "campaign_full" }
  | { status: "rate_limited" };

export type RedeemResult =
  | { status: "redeemed"; prize_name: string; customer_name: string; redeemed_at: string }
  | { status: "invalid_code" }
  | { status: "already_redeemed"; redeemed_at: string }
  | { status: "expired" }
  | { status: "wrong_business" };

// ---------- Event-sourced analytics (Release V1) ----------

export type CustomerEventType =
  | "qr_scan"
  | "registration"
  | "scratch"
  | "prize_won"
  | "prize_lost"
  | "coupon_issued"
  | "coupon_redeemed"
  | "return_visit";

export interface CampaignFunnel {
  scans: number;
  registrations: number;
  scratches: number;
  prizes_won: number;
  coupons: number;
  redemptions: number;
  return_visits: number;
}

/** Coupon Drop campaign analytics (from coupon_drop_stats RPC). */
export interface CouponDropStats {
  codes_minted: number;
  codes_available: number;
  codes_claimed: number;
  codes_redeemed: number;
  fallback_issued: number;
  orders_attributed: number;
  gross_sales_attributed: number;
  avg_order_value: number;
  currency: string;
}

export interface CustomerTimelineEvent {
  id: string;
  event_type: CustomerEventType;
  campaign_id: string | null;
  prize_id: string | null;
  coupon_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LiveWinner {
  event_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  campaign_name: string | null;
  prize_name: string | null;
  prize_type: PrizeType | null;
  prize_value: number | null;
  coupon_code: string | null;
  won_at: string;
}

export interface GiftInventoryRow {
  prize_id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: CampaignStatus;
  prize_name: string;
  prize_type: PrizeType;
  prize_value: number | null;
  is_fallback: boolean;
  weight: number;
  total_quantity: number;
  won_count: number;
  remaining: number;
  image_url: string | null;
  background_color: string | null;
}

// ---------- Campaign Events Engine (Release V1.1) ----------
// The unified, immutable, append-only campaign lifecycle log.
// Mirrors supabase/migrations/0016_campaign_events.sql.

/** Who performed the action. Resolved server-side, never trusted from client. */
export type CampaignEventActor =
  | "platform_admin"
  | "merchant_owner"
  | "merchant_manager"
  | "merchant_staff"
  | "customer"
  | "system"
  | "worker"
  | "cron";

/** Every tracked campaign action. Kept in sync with the CHECK in 0016. */
export type CampaignEventType =
  | "campaign.created"
  | "campaign.updated"
  | "campaign.published"
  | "campaign.activated"
  | "campaign.paused"
  | "campaign.resumed"
  | "campaign.ended"
  | "campaign.deleted"
  | "campaign.duplicated"
  | "campaign.viewed"
  | "campaign.shared"
  | "campaign.archived"
  | "qr.generated"
  | "qr.downloaded"
  | "qr.printed"
  | "poster.printed"
  | "customer.scan"
  | "customer.registered"
  | "scratch.started"
  | "scratch.completed"
  | "prize.allocated"
  | "prize.exhausted"
  | "coupon.generated"
  | "coupon.redeemed"
  | "gift.claimed"
  | "whatsapp.queue"
  | "whatsapp.sent"
  | "whatsapp.delivered"
  | "whatsapp.read"
  | "whatsapp.failed"
  | "csv.export"
  | "customer.export"
  | "merchant.login"
  | "settings.updated"
  | "analytics.viewed"
  // V1.1 final feature build (migration 0023)
  | "reward.created"
  | "reward.updated"
  | "reward.deleted"
  | "reward.duplicated"
  | "reward.enabled"
  | "reward.disabled"
  | "source.created"
  | "source.updated"
  | "source.deleted"
  | "redirect.enabled"
  | "redirect.disabled"
  | "redirect.updated"
  | "redirect.started"
  | "redirect.opened"
  | "redirect.completed"
  | "redirect.cancelled"
  | "reward.viewed"
  | "reward.claimed";

/** A row from campaign_timeline / admin_campaign_timeline RPCs. */
export interface CampaignTimelineEvent {
  id: string;
  actor_type: CampaignEventActor;
  actor_id: string | null;
  event_type: CampaignEventType;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

/** A row from business_recent_events (tenant-wide latest activity feed). */
export interface RecentCampaignEvent {
  id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  actor_type: CampaignEventActor;
  event_type: CampaignEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CampaignActivitySummary {
  total_events: number;
  distinct_actors: number;
  first_activity: string | null;
  last_activity: string | null;
  views: number;
  scans: number;
  registrations: number;
  scratches: number;
  prizes: number;
  coupons: number;
  redemptions: number;
}

export interface CampaignConversion {
  scans: number;
  registrations: number;
  scratches: number;
  prizes: number;
  coupons: number;
  redemptions: number;
  scan_to_reg_rate: number | null;
  reg_to_play_rate: number | null;
  play_to_win_rate: number | null;
  coupon_redeem_rate: number | null;
}

export interface CampaignPerformanceRow {
  campaign_id: string;
  campaign_name: string;
  campaign_status: CampaignStatus;
  total_events: number;
  scans: number;
  registrations: number;
  scratches: number;
  redemptions: number;
  last_activity: string | null;
}

export interface CampaignEventCount {
  event_type: CampaignEventType;
  count: number;
}

export interface CampaignDailyActivityRow {
  day: string;
  events: number;
  scans: number;
  plays: number;
  redemptions: number;
}

/** One row from the traffic_sources aggregate RPC (0020). */
export interface TrafficSourceRow {
  source: string;
  qr_scans: number;
  registrations: number;
  plays: number;
  wins: number;
  redemptions: number;
}

/** One merchant-defined source joined with live analytics (merchant_sources, 0023). */
export interface MerchantSourceRow {
  id: string;
  campaign_id: string | null;
  slug: string;
  label: string;
  qr_scans: number;
  registrations: number;
  plays: number;
  wins: number;
  redemptions: number;
  created_at: string;
}

export interface RewardPerformanceRow {
  prize_id: string;
  name: string;
  prize_type: PrizeType;
  is_active: boolean;
  total_quantity: number;
  won_count: number;
  remaining: number;
  redeemed: number;
}

export interface RedirectAnalytics {
  views: number;
  starts: number;
  opens: number;
  completes: number;
  cancels: number;
  most_visited: string | null;
}
