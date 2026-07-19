import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { WacrmSettings } from "@/components/merchant/wacrm/wacrm-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsApp CRM (WACRM) — EngageOS",
  robots: { index: false, follow: false },
};

export default async function WacrmIntegrationPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations/wacrm");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations/wacrm");

  let wacrmConnected = false;
  try {
    const integration = await getWacrmIntegration(repo.businessId);
    wacrmConnected = !!integration && integration.status !== "disconnected";
  } catch {
    /* non-fatal */
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/integrations/whatsapp.png"
            alt="WhatsApp CRM"
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-[#111827]">WhatsApp CRM (WACRM)</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Connect your WACRM instance as the WhatsApp communication engine for EngageOS.
              {wacrmConnected ? " Connected." : " Not connected."}
            </p>
          </div>
        </div>

        <WacrmSettings />
      </div>
    </MerchantShell>
  );
}
