import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWatiIntegration } from "@/lib/wati/store";
import { listBusinessTracking } from "@/lib/tracking/store";
import { getShop } from "@/lib/shopify/store";
import { getGoogleSheetsIntegration } from "@/lib/google-sheets/store";
import { getZapierIntegrationPublic } from "@/lib/zapier/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import {
  IntegrationsView,
  type IntegrationCardData,
  type IntegrationSectionData,
} from "@/components/merchant/integrations/integrations-view";
import { INTEGRATION_LOGOS } from "@/lib/integrations/logos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations — EngageOS",
  robots: { index: false, follow: false },
};

export default async function IntegrationsPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations");

  // WATI status
  let watiConnected = false;
  let watiAccountName: string | null = null;
  try {
    const wati = await getWatiIntegration(repo.businessId);
    if (wati && wati.status !== "disconnected") {
      watiConnected = true;
      watiAccountName = wati.display_name ?? wati.channel_name ?? "WATI WhatsApp";
    }
  } catch (err) {
    console.error("Failed to load WATI status:", err);
  }

  // Marketing tracking — count enabled+connected providers.
  let trackingConnected = 0;
  try {
    const rows = await listBusinessTracking(repo.businessId);
    trackingConnected = rows.filter((r) => r.enabled && r.status === "connected").length;
  } catch (err) {
    console.error("Failed to load tracking status:", err);
  }

  // Shopify status — a store is "connected" once it holds a live access token.
  let shopifyConnected = false;
  let shopifyAccountName: string | null = null;
  try {
    const shop = await getShop(repo.businessId);
    if (shop && shop.status === "active" && shop.access_token_enc) {
      shopifyConnected = true;
      shopifyAccountName = shop.shop_domain;
    }
  } catch (err) {
    console.error("Failed to load Shopify status:", err);
  }

  // Google Sheets status
  let sheetsConnected = false;
  let sheetsAccountName: string | null = null;
  try {
    const sheets = await getGoogleSheetsIntegration(repo.businessId);
    if (sheets && sheets.status === "connected") {
      sheetsConnected = true;
      sheetsAccountName = sheets.spreadsheet_url ?? sheets.api_key_prefix;
    }
  } catch (err) {
    console.error("Failed to load Google Sheets status:", err);
  }

  // Zapier status
  let zapierConnected = false;
  let zapierAccountName: string | null = null;
  try {
    const zapier = await getZapierIntegrationPublic(repo.businessId);
    if (zapier.status === "connected") {
      zapierConnected = true;
      zapierAccountName =
        zapier.activeSubscriptions > 0
          ? `${zapier.activeSubscriptions} active Zap${zapier.activeSubscriptions > 1 ? "s" : ""}`
          : zapier.apiKeyPrefix ?? "API key connected";
    }
  } catch (err) {
    console.error("Failed to load Zapier status:", err);
  }

  const communicationItems: IntegrationCardData[] = [
    {
      id: "wati",
      name: "WATI WhatsApp",
      description:
        "Connect your official WATI WhatsApp business gateway (API v3) for automated scratch card and coupon distributions.",
      logoSrc: INTEGRATION_LOGOS.wati,
      logoClassName: "h-6 w-auto max-w-[4.5rem] object-contain",
      category: "communication",
      status: watiConnected ? "connected" : "disconnected",
      href: "/m/integrations/wati",
      badgeLabel: watiConnected ? "Connected" : "Available",
      accountName: watiAccountName,
    },
    {
      id: "twilio",
      name: "Twilio SMS",
      description:
        "Fallback to traditional SMS notifications for customers without WhatsApp when they win prizes.",
      logoSrc: INTEGRATION_LOGOS.twilio,
      category: "communication",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
      accountName: null,
    },
    {
      id: "mailchimp",
      name: "Mailchimp",
      description:
        "Sync your scratch card participants and coupon winners instantly with your Mailchimp subscriber lists.",
      logoSrc: INTEGRATION_LOGOS.mailchimp,
      category: "communication",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
      accountName: null,
    },
  ];

  const sections: IntegrationSectionData[] = [
    {
      id: "marketing",
      title: "Marketing Tracking",
      subtitle: "Pipe every customer-journey event to your advertising platforms.",
      items: [
        {
          id: "tracking",
          name: "Advertising Pixels & Tags",
          description:
            "Fire the full customer journey to Meta, GA4, Google Tag Manager, TikTok, Clarity, Microsoft Ads, LinkedIn and Pinterest for retargeting and ROI measurement.",
          logoSrc: INTEGRATION_LOGOS.tracking,
          category: "marketing",
          status: trackingConnected > 0 ? "connected" : "disconnected",
          href: "/m/integrations/tracking",
          badgeLabel:
            trackingConnected > 0 ? `${trackingConnected} Connected` : "8 Providers",
          accountName:
            trackingConnected > 0
              ? `${trackingConnected} provider${trackingConnected > 1 ? "s" : ""} live`
              : null,
        },
      ],
    },
    {
      id: "communication",
      title: "Communication",
      subtitle: "Reach customers over WhatsApp, SMS and email.",
      items: communicationItems,
    },
    {
      id: "reporting",
      title: "Data & Reporting",
      subtitle: "Export customer and coupon data to external tools.",
      items: [
        {
          id: "google-sheets",
          name: "Google Sheets",
          description:
            "Export campaign customers and Shopify coupon codes to a Google Sheet using our Apps Script template — syncs hourly or on demand.",
          logoSrc: INTEGRATION_LOGOS["google-sheets"],
          category: "reporting",
          status: sheetsConnected ? "connected" : "disconnected",
          href: "/m/integrations/google-sheets",
          badgeLabel: sheetsConnected ? "Connected" : "Available",
          accountName: sheetsAccountName,
        },
        {
          id: "zapier",
          name: "Zapier",
          description:
            "Connect EngageOS to 7,000+ apps — trigger Zaps when customers register, scratch, or redeem; push data to CRMs, spreadsheets, and more.",
          logoSrc: INTEGRATION_LOGOS.zapier,
          category: "reporting",
          status: zapierConnected ? "connected" : "disconnected",
          href: "/m/integrations/zapier",
          badgeLabel: zapierConnected ? "Connected" : "Available",
          accountName: zapierAccountName,
        },
      ],
    },
    {
      id: "commerce",
      title: "Commerce",
      subtitle: "Connect your online store to issue and redeem rewards.",
      items: [
        {
          id: "shopify",
          name: "Shopify",
          description:
            "Sync customers, products, orders, collections, inventory and discounts from your Shopify store — with live webhooks and background sync.",
          logoSrc: INTEGRATION_LOGOS.shopify,
          category: "commerce",
          status: shopifyConnected ? "connected" : "disconnected",
          href: "/m/shopify",
          badgeLabel: shopifyConnected ? "Connected" : "Available",
          accountName: shopifyAccountName,
        },
        {
          id: "woocommerce",
          name: "WooCommerce",
          description:
            "Connect your WooCommerce catalog to issue and validate scratch-to-win discount codes automatically.",
          logoSrc: INTEGRATION_LOGOS.woocommerce,
          category: "commerce",
          status: "coming_soon",
          href: "#",
          badgeLabel: "Coming Soon",
          accountName: null,
        },
      ],
    },
  ];

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <IntegrationsView sections={sections} />
    </MerchantShell>
  );
}
