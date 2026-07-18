import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

function fbq(): Fbq | null {
  const w = window as unknown as { fbq?: Fbq };
  return w.fbq ?? null;
}

/**
 * Meta Pixel. Uses standard events where a good analogue exists and custom
 * events for the scratch-to-win specifics called out in the spec.
 */
export class MetaPixelProvider implements TrackingProvider {
  readonly key = "meta_pixel" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("meta_pixel", id)) return;

    initOnce("meta_pixel:sdk", () => {
      // Standard Meta bootstrap stub (queues calls until fbq.js loads).
      const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
      if (!w.fbq) {
        const n: Fbq = function (...args: unknown[]) {
          n.callMethod ? n.callMethod(...args) : n.queue!.push(args);
        } as Fbq;
        n.queue = [];
        n.loaded = true;
        n.version = "2.0";
        w.fbq = n;
        if (!w._fbq) w._fbq = n;
      }
      loadScriptOnce("meta_pixel:script", "https://connect.facebook.net/en_US/fbevents.js");
    });

    initOnce(`meta_pixel:init:${id}`, () => {
      fbq()?.("init", id);
      fbq()?.("track", "PageView");
    });
  }

  track(event: TrackingEventName, _ctx: TrackingContext, payload: TrackingPayload): void {
    const f = fbq();
    if (!f) return;
    switch (event) {
      case "page_view":
      case "landing_viewed":
        // PageView already fired at init; avoid double counting here.
        return;
      case "registration_started":
        f("track", "InitiateCheckout");
        return;
      case "registration_completed":
        f("track", "CompleteRegistration");
        f("track", "Lead");
        return;
      case "scratch_started":
        f("trackCustom", "ScratchStarted");
        return;
      case "scratch_completed":
        f("trackCustom", "ScratchCompleted");
        return;
      case "reward_won":
        f("trackCustom", "RewardWon", { reward: payload.rewardName });
        return;
      case "coupon_generated":
      case "coupon_viewed":
        f("track", "ViewContent", { content_name: payload.rewardName });
        return;
      case "coupon_redeemed":
        f("trackCustom", "CouponRedeemed", { coupon_id: payload.couponId });
        return;
      case "campaign_completed":
        f("trackCustom", "CampaignPlayed");
        return;
      case "shop_now_clicked":
      case "redirect_clicked":
      case "whatsapp_cta_clicked":
        f("trackCustom", "OutboundClick", { destination: payload.destination });
        return;
      default:
        f("trackCustom", toPascal(event));
    }
  }
}

function toPascal(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_m, _p, c: string) => c.toUpperCase());
}
