import type { TrackingProvider } from "./provider";
import type { ProviderKey } from "./types";
import { MetaPixelProvider } from "./providers/meta";
import { GA4Provider } from "./providers/ga4";
import { GTMProvider } from "./providers/gtm";
import { ClarityProvider } from "./providers/clarity";
import { MicrosoftAdsProvider } from "./providers/microsoft-ads";
import { TikTokProvider } from "./providers/tiktok";
import { LinkedInProvider } from "./providers/linkedin";
import { PinterestProvider } from "./providers/pinterest";

/**
 * The single place that maps a provider key to its implementation. To add a
 * new marketing platform: write providers/<x>.ts, then add ONE line here (and
 * a provider-meta entry + the DB enum key). No business logic changes.
 */
export const PROVIDER_REGISTRY: Record<ProviderKey, () => TrackingProvider> = {
  meta_pixel: () => new MetaPixelProvider(),
  ga4: () => new GA4Provider(),
  gtm: () => new GTMProvider(),
  clarity: () => new ClarityProvider(),
  microsoft_ads: () => new MicrosoftAdsProvider(),
  tiktok: () => new TikTokProvider(),
  linkedin: () => new LinkedInProvider(),
  pinterest: () => new PinterestProvider(),
};

export function createProvider(key: ProviderKey): TrackingProvider | null {
  const factory = PROVIDER_REGISTRY[key];
  return factory ? factory() : null;
}
