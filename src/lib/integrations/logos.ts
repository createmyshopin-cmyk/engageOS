/**
 * Brand logos for the merchant integrations catalog.
 * Local SVGs live in /public/integrations; WATI uses their official CDN asset.
 */
export const INTEGRATION_LOGOS = {
  tracking: "/integrations/ad-tracking.svg",
  wati: "https://assets.wati.io/cdn-cgi/image/f=auto/images/WATI_logo_full.png",
  twilio: "/integrations/twilio.svg",
  mailchimp: "/integrations/mailchimp.svg",
  "google-sheets": "/integrations/google-sheets.svg",
  zapier: "/integrations/zapier.svg",
  shopify: "/integrations/shopify.png",
  woocommerce: "/integrations/woocommerce.png",
} as const;

export type IntegrationLogoId = keyof typeof INTEGRATION_LOGOS;
