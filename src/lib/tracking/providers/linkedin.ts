import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { initOnce, loadScriptOnce } from "../script-loader";

/**
 * LinkedIn Insight Tag. Supports page view (partner id init) and conversion
 * events pushed onto window.lintrk.
 */
export class LinkedInProvider implements TrackingProvider {
  readonly key = "linkedin" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("linkedin", id)) return;

    initOnce(`linkedin:init:${id}`, () => {
      const w = window as unknown as {
        _linkedin_partner_id?: string;
        _linkedin_data_partner_ids?: string[];
        lintrk?: ((...a: unknown[]) => void) & { q?: unknown[] };
      };
      w._linkedin_partner_id = id;
      w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || [];
      w._linkedin_data_partner_ids.push(id);
      if (!w.lintrk) {
        const l = function (...args: unknown[]) {
          (l.q = l.q || []).push(args);
        } as ((...a: unknown[]) => void) & { q?: unknown[] };
        w.lintrk = l;
      }
      loadScriptOnce("linkedin:script", "https://snap.licdn.com/li.lms-analytics/insight.min.js");
    });
  }

  track(event: TrackingEventName, _ctx: TrackingContext, _payload: TrackingPayload): void {
    // LinkedIn conversions are keyed by numeric conversion ids configured in
    // Campaign Manager; without one we simply signal the generic tracker so the
    // page view / session is attributed. Named events are a no-op by design.
    const w = window as unknown as { lintrk?: (cmd: string, opts?: unknown) => void };
    if (event === "registration_completed" || event === "coupon_redeemed") {
      w.lintrk?.("track");
    }
  }
}
