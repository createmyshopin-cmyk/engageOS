import type {
  ProviderKey,
  TrackingConfig,
  TrackingContext,
  TrackingEventName,
  TrackingPayload,
} from "./types";

/**
 * The single contract every marketing platform implements. Adding a new
 * platform means writing ONE class that satisfies this interface and
 * registering it — no business logic changes anywhere else.
 *
 * Providers run only in the browser. They must be defensive: never throw
 * (the engine also guards), and never assume another provider's globals.
 */
export interface TrackingProvider {
  /** Stable key, matches the DB `tracking_provider` enum. */
  readonly key: ProviderKey;

  /**
   * Inject the platform script (idempotently) and initialise the pixel/tag
   * with the merchant's public id. Called at most once per provider per page.
   */
  init(config: TrackingConfig, context: TrackingContext): void;

  /** Translate a canonical event into the platform's native call(s). */
  track(
    event: TrackingEventName,
    context: TrackingContext,
    payload: TrackingPayload,
  ): void;
}
