import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type Ttq = ((...args: unknown[]) => void) & {
  page?: () => void;
  track?: (name: string, props?: unknown) => void;
  load?: (id: string) => void;
  methods?: string[];
  _i?: Record<string, unknown[]>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
  push?: (...a: unknown[]) => void;
  instance?: (id: string) => Ttq;
};

function ttq(): Ttq | null {
  const w = window as unknown as { ttq?: Ttq };
  return w.ttq ?? null;
}

/**
 * TikTok Pixel. Maps canonical events onto TikTok's standard event names.
 */
export class TikTokProvider implements TrackingProvider {
  readonly key = "tiktok" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("tiktok", id)) return;

    initOnce("tiktok:sdk", () => {
      const w = window as unknown as { TiktokAnalyticsObject?: string; ttq?: Ttq };
      w.TiktokAnalyticsObject = "ttq";
      const t: Ttq = (w.ttq = w.ttq || (function (...args: unknown[]) {
        (t.push as (...a: unknown[]) => void)?.(...args);
      } as Ttq));
      t.methods = ["page", "track", "identify", "instance", "load", "ready"];
      t.push = t.push || ((...a: unknown[]) => ((t as unknown as { queue?: unknown[] }).queue ||= []).push(a));
      for (const m of t.methods) {
        if (!(t as unknown as Record<string, unknown>)[m]) {
          (t as unknown as Record<string, unknown>)[m] = (...args: unknown[]) =>
            t.push!(m, ...args);
        }
      }
      loadScriptOnce("tiktok:script", "https://analytics.tiktok.com/i18n/pixel/events.js");
    });

    initOnce(`tiktok:init:${id}`, () => {
      ttq()?.load?.(id);
      ttq()?.page?.();
    });
  }

  track(event: TrackingEventName, _ctx: TrackingContext, payload: TrackingPayload): void {
    const t = ttq();
    if (!t?.track) return;
    const name = TIKTOK_EVENT_MAP[event];
    if (name) t.track(name, { content_name: payload.rewardName });
  }
}

const TIKTOK_EVENT_MAP: Partial<Record<TrackingEventName, string>> = {
  registration_completed: "CompleteRegistration",
  scratch_started: "ClickButton",
  reward_won: "AddToWishlist",
  coupon_generated: "ViewContent",
  coupon_redeemed: "CompletePayment",
  shop_now_clicked: "ClickButton",
};
