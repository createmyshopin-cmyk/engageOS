import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getIntegration } from "@/lib/wacrm/store";
import { getWatiIntegration } from "@/lib/wati/store";
import { listBusinessTracking } from "@/lib/tracking/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import {
  Blocks,
  MessageSquare,
  Mail,
  Plug,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Radio,
  Radar,
  ShoppingBag,
  Store,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations — EngageOS",
  robots: { index: false, follow: false },
};

interface IntegrationCardData {
  id: string;
  name: string;
  description: string;
  icon: typeof MessageSquare;
  iconBg: string;
  iconColor: string;
  status: "connected" | "disconnected" | "coming_soon";
  href: string;
  badgeLabel: string;
  accountName: string | null;
}

export default async function IntegrationsPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations");

  // wacrm status
  let wacrmConnected = false;
  let wacrmAccountName: string | null = null;
  try {
    const integration = await getIntegration(repo.businessId);
    if (integration && integration.status !== "disconnected") {
      wacrmConnected = true;
      wacrmAccountName = integration.account_name ?? "WhatsApp Business Line";
    }
  } catch (err) {
    console.error("Failed to load integrations status:", err);
  }

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

  const marketing: IntegrationCardData[] = [
    {
      id: "tracking",
      name: "Advertising Pixels & Tags",
      description:
        "Fire the full customer journey to Meta, GA4, Google Tag Manager, TikTok, Clarity, Microsoft Ads, LinkedIn and Pinterest for retargeting and ROI measurement.",
      icon: Radar,
      iconBg: "bg-[#EEF2FF]",
      iconColor: "text-[#4F46E5]",
      status: trackingConnected > 0 ? "connected" : "disconnected",
      href: "/m/integrations/tracking",
      badgeLabel:
        trackingConnected > 0
          ? `${trackingConnected} Connected`
          : "8 Providers",
      accountName:
        trackingConnected > 0
          ? `${trackingConnected} provider${trackingConnected > 1 ? "s" : ""} live`
          : null,
    },
  ];

  const communication: IntegrationCardData[] = [
    {
      id: "wacrm",
      name: "WhatsApp CRM (Meta Cloud API)",
      description:
        "Send automated coupon notifications, scratch-to-win reminders, and support chats directly via Meta Cloud API.",
      icon: MessageSquare,
      iconBg: "bg-[#DCFCE7]",
      iconColor: "text-[#16A34A]",
      status: wacrmConnected ? "connected" : "disconnected",
      href: "/m/whatsapp",
      badgeLabel: wacrmConnected ? "Connected" : "Available",
      accountName: wacrmAccountName,
    },
    {
      id: "wati",
      name: "WATI WhatsApp",
      description:
        "Connect your official WATI WhatsApp business gateway (API v3) for automated scratch card and coupon distributions.",
      icon: Zap,
      iconBg: "bg-[#EFF6FF]",
      iconColor: "text-[#3B82F6]",
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
      icon: Radio,
      iconBg: "bg-[#FEF2F2]",
      iconColor: "text-[#EF4444]",
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
      icon: Mail,
      iconBg: "bg-[#FFFBEB]",
      iconColor: "text-[#D97706]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
      accountName: null,
    },
    {
      id: "webhooks",
      name: "Custom Webhooks",
      description:
        "Send real-time webhook payloads to your external endpoints when customers scratch or redeem coupons.",
      icon: Globe,
      iconBg: "bg-[#F3E8FF]",
      iconColor: "text-[#A855F7]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Enterprise Only",
      accountName: null,
    },
  ];

  const commerce: IntegrationCardData[] = [
    {
      id: "shopify",
      name: "Shopify",
      description:
        "Sync products and reward coupons with your Shopify store so winners can redeem instantly at checkout.",
      icon: ShoppingBag,
      iconBg: "bg-[#ECFDF5]",
      iconColor: "text-[#059669]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
      accountName: null,
    },
    {
      id: "woocommerce",
      name: "WooCommerce",
      description:
        "Connect your WooCommerce catalog to issue and validate scratch-to-win discount codes automatically.",
      icon: Store,
      iconBg: "bg-[#F5F3FF]",
      iconColor: "text-[#7C3AED]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
      accountName: null,
    },
  ];

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7]">
            <Blocks className="size-5 text-[#16A34A]" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#111827]">Integrations</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Connect your external marketing tools, CRMs, and messaging channels to EngageOS.
            </p>
          </div>
        </div>

        <IntegrationSection
          title="Marketing Tracking"
          subtitle="Pipe every customer-journey event to your advertising platforms."
          items={marketing}
        />

        <IntegrationSection
          title="Communication"
          subtitle="Reach customers over WhatsApp, SMS and email."
          items={communication}
        />

        <IntegrationSection
          title="Commerce"
          subtitle="Connect your online store to issue and redeem rewards."
          items={commerce}
        />
      </div>
    </MerchantShell>
  );
}

function IntegrationSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: IntegrationCardData[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider text-[#111827]">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-[#6B7280] font-medium">{subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <IntegrationCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function IntegrationCard({ item }: { item: IntegrationCardData }) {
  const Icon = item.icon;
  const isConnected = item.status === "connected";
  const isDisconnected = item.status === "disconnected";

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div>
        <div className="flex items-center justify-between">
          <div className={`flex items-center justify-center size-10 rounded-2xl ${item.iconBg}`}>
            <Icon className={`size-5 ${item.iconColor}`} />
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              isConnected
                ? "bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]"
                : isDisconnected
                  ? "bg-neutral-50 text-neutral-600 border border-neutral-200"
                  : "bg-amber-50 text-amber-600 border border-amber-200"
            }`}
          >
            {isConnected && <span className="size-1.5 rounded-full bg-[#16A34A] animate-pulse" />}
            {item.badgeLabel}
          </span>
        </div>

        <h3 className="mt-4 text-sm font-black text-[#111827]">{item.name}</h3>
        <p className="mt-2 text-xs text-[#6B7280] font-medium leading-relaxed">
          {item.description}
        </p>

        {isConnected && item.accountName && (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
            <ShieldCheck className="size-4 text-[#16A34A]" />
            <span className="text-[10px] font-bold text-neutral-600 truncate">
              {item.accountName}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[#F3F4F6]">
        {isConnected ? (
          <Link
            href={item.href}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#16A34A] hover:text-[#15803D] transition-colors"
          >
            Configure settings
            <ArrowRight className="size-3.5" />
          </Link>
        ) : isDisconnected ? (
          <Link
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold px-4 py-2 transition-all shadow-sm cursor-pointer"
          >
            <Plug className="size-3.5" />
            Connect
          </Link>
        ) : (
          <button
            disabled
            className="inline-flex items-center gap-1 text-xs font-bold text-neutral-400 cursor-not-allowed"
          >
            Request access
          </button>
        )}
      </div>
    </div>
  );
}
