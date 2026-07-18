import type { TrackingProvider } from "./provider";
import type {
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "./types";
import { createProvider } from "./registry";

/**
 * The Tracking Engine. Instantiates the enabled providers once, then fans out
 * every canonical event to all of them. It is intentionally dumb about what any
 * provider does — it just distributes. Per-provider errors are swallowed so one
 * misbehaving tag can never break the customer flow or another provider.
 *
 * Duplicate-init safe: init() ignores a provider key that is already active and
 * is itself a no-op after the first call for a given config set (the underlying
 * script-loader guards script/pixel injection too).
 */
export class TrackingEngine {
  private providers = new Map<string, TrackingProvider>();
  private context: TrackingContext | null = null;
  private started = false;

  /** Are any providers active? */
  get active(): boolean {
    return this.providers.size > 0;
  }

  init(configs: TrackingConfig[], context: TrackingContext): void {
    this.context = context;
    for (const config of configs) {
      if (this.providers.has(config.provider)) continue; // dedupe
      const provider = createProvider(config.provider);
      if (!provider) continue;
      try {
        provider.init(config, context);
        this.providers.set(config.provider, provider);
      } catch (err) {
        console.error(`tracking provider ${config.provider} init failed:`, err);
      }
    }
    this.started = true;
  }

  track(event: TrackingEventName, payload: TrackingPayload = {}): void {
    if (!this.started || !this.context) return;
    for (const provider of this.providers.values()) {
      try {
        provider.track(event, this.context, payload);
      } catch (err) {
        console.error(`tracking provider ${provider.key} track(${event}) failed:`, err);
      }
    }
  }

  /** Fire one event through a SINGLE provider (used by the Test Event button). */
  trackVia(
    key: string,
    event: TrackingEventName,
    context: TrackingContext,
    payload: TrackingPayload = {},
  ): void {
    const provider = this.providers.get(key);
    if (!provider) return;
    try {
      provider.track(event, context, payload);
    } catch (err) {
      console.error(`tracking provider ${key} test failed:`, err);
    }
  }
}
