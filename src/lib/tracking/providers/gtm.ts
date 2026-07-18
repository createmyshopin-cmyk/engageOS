import type { TrackingProvider } from "../provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "../types";
import { isValidProviderId } from "../validation";
import { dataLayer, initOnce, loadScriptOnce } from "../script-loader";

/**
 * Google Tag Manager. Pushes every canonical event onto window.dataLayer with
 * the full campaign context, exactly as the spec requires. Merchants wire their
 * own tags/triggers inside GTM against these dataLayer events.
 */
export class GTMProvider implements TrackingProvider {
  readonly key = "gtm" as const;

  init(config: TrackingConfig): void {
    const id = config.providerId.trim();
    if (!isValidProviderId("gtm", id)) return;

    initOnce(`gtm:init:${id}`, () => {
      dataLayer().push({ "gtm.start": Date.now(), event: "gtm.js" });
      loadScriptOnce(
        `gtm:script:${id}`,
        `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`,
      );
    });
  }

  track(event: TrackingEventName, ctx: TrackingContext, payload: TrackingPayload): void {
    dataLayer().push({
      event,
      campaign_id: ctx.campaignId,
      campaign_name: ctx.campaignName,
      merchant_id: ctx.merchantId,
      merchant_name: ctx.merchantName,
      reward_name: payload.rewardName ?? null,
      coupon_id: payload.couponId ?? null,
      coupon_type: payload.couponType ?? null,
      traffic_source: ctx.trafficSource,
      device_type: ctx.deviceType,
    });
  }
}
