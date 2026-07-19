import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWatiIntegration } from "@/lib/wati/store";
import type { WatiIntegration } from "@/lib/wati/types";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { WatiConsole } from "@/components/merchant/wati/wati-console";
import { WatiLoadingPanel } from "@/components/merchant/wati/overview-tab";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WATI — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * WATI console hub. Appears in the sidebar once a merchant connects WATI.
 * Every tab consumes the tenant's own WATI gateway (API v3) through the
 * /api/m/wati and /api/m/integrations/wati adapters — the browser never
 * talks to WATI directly and the token stays encrypted server-side.
 *
 * If WATI isn't connected yet, we send the merchant to the connect flow on
 * the Integrations page rather than showing an empty console.
 */
export default async function WatiConsolePage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/wati");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/wati");

  let integration: WatiIntegration | null = null;
  try {
    integration = await getWatiIntegration(repo.businessId);
  } catch (err) {
    console.error("wati console load error:", err);
  }

  // Not connected → route to the connect/settings page.
  if (!integration || integration.status === "disconnected") {
    redirect("/m/integrations/wati");
  }

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- external brand asset from WATI CDN */}
          <img
            src="https://assets.wati.io/cdn-cgi/image/f=auto/images/WATI_logo_full.png"
            alt="WATI"
            className="h-7 w-auto shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-[#111827]">WhatsApp Console</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                  integration.status === "connected"
                    ? "bg-[#DBEAFE] text-[#2563EB]"
                    : "bg-[#FEF3C7] text-[#B45309]"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    integration.status === "connected" ? "bg-[#2563EB] animate-pulse" : "bg-[#F59E0B]"
                  }`}
                />
                {integration.status}
              </span>
            </div>
            <p className="text-xs text-[#6B7280] font-medium">
              {integration.display_name ?? integration.channel_name ?? "WATI gateway"} · Templates,
              automation, coupon delivery and analytics
            </p>
          </div>
          <Link
            href="/m/integrations/wati"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB] transition-colors"
          >
            <Settings className="size-3.5" />
            Connection
          </Link>
        </div>

        <Suspense fallback={<WatiLoadingPanel label="Loading WATI console…" />}>
          <WatiConsole baseUrl={integration.base_url} />
        </Suspense>
      </div>
    </MerchantShell>
  );
}
