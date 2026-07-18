import type { ProviderKey } from "./types";
import { PROVIDER_ID_FORMAT } from "./validation";

/**
 * Merchant-facing display metadata for each provider, used to render the
 * settings cards and the campaign override rows. Icons are referenced by
 * lucide-react name so the component can map them without importing here.
 */
export interface ProviderMeta {
  key: ProviderKey;
  label: string;
  category: "tracking";
  idLabel: string;
  placeholder: string;
  format: string;
  helpUrl: string;
  accent: string; // tailwind text color class for the badge/icon
}

export const PROVIDER_META: Record<ProviderKey, ProviderMeta> = {
  meta_pixel: {
    key: "meta_pixel",
    label: "Meta Pixel",
    category: "tracking",
    idLabel: "Pixel ID",
    placeholder: "123456789012345",
    format: PROVIDER_ID_FORMAT.meta_pixel,
    helpUrl: "https://www.facebook.com/business/help/952192354843755",
    accent: "text-[#1877F2]",
  },
  gtm: {
    key: "gtm",
    label: "Google Tag Manager",
    category: "tracking",
    idLabel: "Container ID",
    placeholder: "GTM-XXXXXXX",
    format: PROVIDER_ID_FORMAT.gtm,
    helpUrl: "https://support.google.com/tagmanager/answer/6103696",
    accent: "text-[#4285F4]",
  },
  ga4: {
    key: "ga4",
    label: "Google Analytics 4",
    category: "tracking",
    idLabel: "Measurement ID",
    placeholder: "G-XXXXXXXXXX",
    format: PROVIDER_ID_FORMAT.ga4,
    helpUrl: "https://support.google.com/analytics/answer/9539598",
    accent: "text-[#E37400]",
  },
  clarity: {
    key: "clarity",
    label: "Microsoft Clarity",
    category: "tracking",
    idLabel: "Project ID",
    placeholder: "abcdefghij",
    format: PROVIDER_ID_FORMAT.clarity,
    helpUrl: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup",
    accent: "text-[#0078D4]",
  },
  microsoft_ads: {
    key: "microsoft_ads",
    label: "Microsoft Ads (UET)",
    category: "tracking",
    idLabel: "UET Tag ID",
    placeholder: "12345678",
    format: PROVIDER_ID_FORMAT.microsoft_ads,
    helpUrl: "https://help.ads.microsoft.com/apex/index/3/en/56682",
    accent: "text-[#0078D4]",
  },
  tiktok: {
    key: "tiktok",
    label: "TikTok Pixel",
    category: "tracking",
    idLabel: "Pixel ID",
    placeholder: "CABC12DEF34GHI56JKL7",
    format: PROVIDER_ID_FORMAT.tiktok,
    helpUrl: "https://ads.tiktok.com/help/article/get-started-pixel",
    accent: "text-[#111827]",
  },
  linkedin: {
    key: "linkedin",
    label: "LinkedIn Insight Tag",
    category: "tracking",
    idLabel: "Partner ID",
    placeholder: "1234567",
    format: PROVIDER_ID_FORMAT.linkedin,
    helpUrl: "https://www.linkedin.com/help/lms/answer/a418880",
    accent: "text-[#0A66C2]",
  },
  pinterest: {
    key: "pinterest",
    label: "Pinterest Tag",
    category: "tracking",
    idLabel: "Tag ID",
    placeholder: "2612345678901",
    format: PROVIDER_ID_FORMAT.pinterest,
    helpUrl: "https://help.pinterest.com/en/business/article/install-the-pinterest-tag",
    accent: "text-[#E60023]",
  },
};

export const PROVIDER_META_LIST: ProviderMeta[] = [
  PROVIDER_META.meta_pixel,
  PROVIDER_META.ga4,
  PROVIDER_META.gtm,
  PROVIDER_META.clarity,
  PROVIDER_META.microsoft_ads,
  PROVIDER_META.tiktok,
  PROVIDER_META.linkedin,
  PROVIDER_META.pinterest,
];
