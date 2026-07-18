import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type UetQueue = { push: (...args: unknown[]) => void };

function uetq(): UetQueue | null {
  const w = window as unknown as { uetq?: UetQueue };
  return w.uetq ?? null;
}

/**
 * Microsoft Advertising UET (Universal Event Tracking). Fires custom events
 * onto the uetq queue with campaign context.
 */
export class MicrosoftAdsProvider implements TrackingProvider {
  readonly key = "microsoft_ads" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("microsoft_ads", id)) return;

    initOnce(`microsoft_ads:init:${id}`, () => {
      const w = window as unknown as { uetq?: unknown[]; UET?: unknown };
      w.uetq = w.uetq || [];
      loadScriptOnce("microsoft_ads:script", "https://bat.bing.com/bat.js");
      // The bat.js bootstrap reads the tag id from the first queued config.
      (w.uetq as unknown[]).push({ ti: id, enableAutoSpaTracking: true });
    });
  }

  track(event: TrackingEventName, ctx: TrackingContext, payload: TrackingPayload): void {
    uetq()?.push("event", event, {
      event_category: "engageos",
      event_label: ctx.campaignName,
      reward_name: payload.rewardName,
    });
  }
}
