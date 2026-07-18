import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type Gtag = (...args: unknown[]) => void;

function gtag(): Gtag | null {
  const w = window as unknown as { gtag?: Gtag };
  return w.gtag ?? null;
}

/**
 * Google Analytics 4 (gtag.js). Uses GA4 recommended event names where they
 * map cleanly (sign_up, view_item, select_promotion) and custom events for the
 * scratch mechanics, always attaching campaign context params.
 */
export class GA4Provider implements TrackingProvider {
  readonly key = "ga4" as const;

  init(config: TrackingConfig, ctx: TrackingContext): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("ga4", id)) return;

    initOnce("ga4:sdk", () => {
      const w = window as unknown as { dataLayer?: unknown[]; gtag?: Gtag };
      w.dataLayer = w.dataLayer || [];
      const g: Gtag = function (...args: unknown[]) {
        w.dataLayer!.push(args);
      };
      w.gtag = g;
      g("js", new Date());
      loadScriptOnce(
        "ga4:script",
        `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
      );
    });

    initOnce(`ga4:init:${id}`, () => {
      gtag()?.("config", id, {
        campaign_id: ctx.campaignId,
        campaign_name: ctx.campaignName,
      });
    });
  }

  track(event: TrackingEventName, ctx: TrackingContext, payload: TrackingPayload): void {
    const g = gtag();
    if (!g) return;
    const base = {
      campaign_id: ctx.campaignId,
      campaign_name: ctx.campaignName,
      merchant_id: ctx.merchantId,
      merchant_name: ctx.merchantName,
      traffic_source: ctx.trafficSource,
      device_type: ctx.deviceType,
      reward_name: payload.rewardName,
      coupon_id: payload.couponId,
      coupon_type: payload.couponType,
    };
    const name = GA4_EVENT_MAP[event] ?? event;
    g("event", name, base);
  }
}

/** Canonical → GA4 recommended event names (fallback: canonical name). */
const GA4_EVENT_MAP: Partial<Record<TrackingEventName, string>> = {
  page_view: "page_view",
  registration_completed: "sign_up",
  coupon_generated: "select_promotion",
  coupon_viewed: "view_promotion",
  coupon_redeemed: "spend_virtual_currency",
  reward_won: "unlock_achievement",
  shop_now_clicked: "select_content",
};
