import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWatiIntegration } from "@/lib/wati/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { WatiSettings } from "@/components/merchant/wati/wati-settings";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WATI WhatsApp — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * WATI WhatsApp integration settings. WATI is an official WhatsApp Business
 * gateway (API v3). The browser never talks to WATI directly — every call
 * goes through the /api/m/integrations/wati adapter, which holds the
 * encrypted token server-side.
 */
export default async function WatiIntegrationPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations/wati");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations/wati");

  let watiConnected = false;
  try {
    const integration = await getWatiIntegration(repo.businessId);
    watiConnected = !!integration && integration.status === "connected";
  } catch {
    /* non-fatal — settings UI will reflect state */
  }

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
        <Link
          href="/m/integrations"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Back to Integrations
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- external brand asset from WATI CDN */}
          <img
            src="https://assets.wati.io/cdn-cgi/image/f=auto/images/WATI_logo_full.png"
            alt="WATI"
            className="h-7 w-auto shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#111827]">WhatsApp Gateway</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Connect your official WATI WhatsApp business gateway (API v3) to send
              approved template messages from EngageOS.
            </p>
          </div>
          {watiConnected && (
            <Link
              href="/m/wati"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#2563EB] transition-colors"
            >
              Open console
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>

        <WatiSettings />
      </div>
    </MerchantShell>
  );
}
