import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getIntegration } from "@/lib/wacrm/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { 
  Blocks, 
  MessageSquare, 
  Mail, 
  Plus, 
  Plug, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Radio,
  FileText
} from "lucide-react";

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

  // Query actual wacrm status
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

  const integrationsList = [
    {
      id: "wacrm",
      name: "WhatsApp CRM (Meta Cloud API)",
      description: "Send automated coupon notifications, scratch-to-win reminders, and support chats directly via Meta Cloud API.",
      icon: MessageSquare,
      iconBg: "bg-[#DCFCE7]",
      iconColor: "text-[#16A34A]",
      status: wacrmConnected ? "connected" : "disconnected",
      href: "/m/whatsapp",
      badgeLabel: wacrmConnected ? "Connected" : "Available",
    },
    {
      id: "wati",
      name: "WATI WhatsApp",
      description: "Connect your official WATI WhatsApp business gateway for automated scratch card distributions.",
      icon: Zap,
      iconBg: "bg-[#EFF6FF]",
      iconColor: "text-[#3B82F6]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
    },
    {
      id: "twilio",
      name: "Twilio SMS",
      description: "Fallback to traditional SMS notifications for customers without WhatsApp when they win prizes.",
      icon: Radio,
      iconBg: "bg-[#FEF2F2]",
      iconColor: "text-[#EF4444]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
    },
    {
      id: "mailchimp",
      name: "Mailchimp",
      description: "Sync your scratch card participants and coupon winners instantly with your Mailchimp subscriber lists.",
      icon: Mail,
      iconBg: "bg-[#FFFBEB]",
      iconColor: "text-[#D97706]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Coming Soon",
    },
    {
      id: "webhooks",
      name: "Custom Webhooks",
      description: "Send real-time webhook payloads to your external endpoints when customers scratch or redeem coupons.",
      icon: Globe,
      iconBg: "bg-[#F3E8FF]",
      iconColor: "text-[#A855F7]",
      status: "coming_soon",
      href: "#",
      badgeLabel: "Enterprise Only",
    }
  ];

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
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

        {/* Directory Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrationsList.map((item) => {
            const Icon = item.icon;
            const isConnected = item.status === "connected";
            const isDisconnected = item.status === "disconnected";
            const isComingSoon = item.status === "coming_soon";

            return (
              <div 
                key={item.id} 
                className="flex flex-col justify-between rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center justify-center size-10 rounded-2xl ${item.iconBg}`}>
                      <Icon className={`size-5 ${item.iconColor}`} />
                    </div>

                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isConnected 
                        ? "bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]" 
                        : isDisconnected 
                          ? "bg-neutral-50 text-neutral-600 border border-neutral-200"
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                    }`}>
                      {isConnected && <span className="size-1.5 rounded-full bg-[#16A34A] animate-pulse" />}
                      {item.badgeLabel}
                    </span>
                  </div>

                  <h3 className="mt-4 text-sm font-black text-[#111827]">{item.name}</h3>
                  <p className="mt-2 text-xs text-[#6B7280] font-medium leading-relaxed">
                    {item.description}
                  </p>

                  {isConnected && wacrmAccountName && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
                      <ShieldCheck className="size-4 text-[#16A34A]" />
                      <span className="text-[10px] font-bold text-neutral-600 truncate">
                        Linked as: {wacrmAccountName}
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
          })}
        </div>
      </div>
    </MerchantShell>
  );
}
