/** Mirrors of EngageOS backend contract types (src/lib/types.ts in the Next.js app). */

export type PrizeType =
  | "coupon"
  | "physical_gift"
  | "gift_voucher"
  | "lucky_draw"
  | "cashback"
  | "wallet_points";

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

export type RedirectDelay = 0 | 3 | 5 | 10 | 15 | 30;

export interface RedirectSettings {
  enabled: boolean;
  delay: RedirectDelay;
  destination_type: RedirectDestinationType;
  url: string | null;
}

export type PreloaderDuration = 300 | 600 | 1000;

export type ExperienceTheme = "light" | "dark" | "brand";

/** Customer Experience settings (campaign_display.experience, migration 0026). */
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

/** Safe defaults when the deployed RPC predates migration 0026. */
export const DEFAULT_EXPERIENCE: ExperienceSettings = {
  preloader_enabled: true,
  preloader_duration: 600,
  confetti_enabled: true,
  sound_enabled: false,
  haptics_enabled: false,
  open_native_app: true,
  show_countdown: true,
  allow_skip: true,
  button_text: null,
  theme: "dark",
};

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
      coupon_code: string | null;
      expires_at: string | null;
    }
  | { status: "ok"; won: false }
  | { status: "already_played" }
  | { status: "campaign_inactive" }
  | { status: "campaign_full" }
  | { status: "rate_limited" };

export type BlockedStatus = Exclude<PlayResult["status"], "ok">;

export type ExperienceEventType =
  | "reward.viewed"
  | "reward.claimed"
  | "redirect.started"
  | "redirect.opened"
  | "redirect.completed"
  | "redirect.cancelled";

export interface PlayRequest {
  merchantSlug: string;
  campaignSlug: string;
  name: string;
  phone: string;
  source?: string;
}

export interface PlayApiResponse {
  ok: boolean;
  result?: PlayResult;
  error?: string;
  fields?: { name?: string; phone?: string };
}
