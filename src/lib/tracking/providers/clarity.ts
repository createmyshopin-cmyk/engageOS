import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

type Clarity = ((...args: unknown[]) => void) & { q?: unknown[] };

function clarity(): Clarity | null {
  const w = window as unknown as { clarity?: Clarity };
  return w.clarity ?? null;
}

/**
 * Microsoft Clarity. Records sessions and attaches campaign metadata as custom
 * tags (clarity('set', ...)) plus custom events (clarity('event', ...)).
 */
export class ClarityProvider implements TrackingProvider {
  readonly key = "clarity" as const;

  init(config: TrackingConfig, ctx: TrackingContext): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("clarity", id)) return;

    initOnce(`clarity:init:${id}`, () => {
      const w = window as unknown as { clarity?: Clarity };
      if (!w.clarity) {
        const c: Clarity = function (...args: unknown[]) {
          (c.q = c.q || []).push(args);
        } as Clarity;
        w.clarity = c;
      }
      loadScriptOnce(`clarity:script:${id}`, `https://www.clarity.ms/tag/${encodeURIComponent(id)}`);
      // Campaign metadata as session tags.
      clarity()?.("set", "campaign_id", ctx.campaignId);
      clarity()?.("set", "campaign_name", ctx.campaignName);
      clarity()?.("set", "merchant_name", ctx.merchantName);
    });
  }

  track(event: TrackingEventName, _ctx: TrackingContext, _payload: TrackingPayload): void {
    clarity()?.("event", event);
  }
}
