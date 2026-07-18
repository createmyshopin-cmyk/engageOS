import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type Pintrk = ((...args: unknown[]) => void) & {
  queue?: unknown[];
  version?: string;
};

function pintrk(): Pintrk | null {
  const w = window as unknown as { pintrk?: Pintrk };
  return w.pintrk ?? null;
}

/**
 * Pinterest Tag. Supports page view (init) and conversion events.
 */
export class PinterestProvider implements TrackingProvider {
  readonly key = "pinterest" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("pinterest", id)) return;

    initOnce("pinterest:sdk", () => {
      const w = window as unknown as { pintrk?: Pintrk };
      if (!w.pintrk) {
        const p: Pintrk = function (...args: unknown[]) {
          p.queue!.push(args);
        } as Pintrk;
        p.queue = [];
        p.version = "3.0";
        w.pintrk = p;
      }
      loadScriptOnce("pinterest:script", "https://s.pinimg.com/ct/core.js");
    });

    initOnce(`pinterest:init:${id}`, () => {
      pintrk()?.("load", id);
      pintrk()?.("page");
    });
  }

  track(event: TrackingEventName, _ctx: TrackingContext, payload: TrackingPayload): void {
    const p = pintrk();
    if (!p) return;
    const name = PINTEREST_EVENT_MAP[event];
    if (name) p("track", name, { lead_type: payload.rewardName });
  }
}

const PINTEREST_EVENT_MAP: Partial<Record<TrackingEventName, string>> = {
  registration_completed: "lead",
  reward_won: "custom",
  coupon_generated: "addtocart",
  coupon_redeemed: "checkout",
  shop_now_clicked: "custom",
};
