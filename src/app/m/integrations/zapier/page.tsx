import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { ZapierSettings } from "@/components/merchant/zapier/zapier-settings";
import { ArrowLeft, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zapier — EngageOS",
  robots: { index: false, follow: false },
};

export default async function ZapierIntegrationPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations/zapier");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations/zapier");

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
          <div className="flex items-center justify-center size-10 rounded-2xl bg-[#FFF7ED] border border-[#FFEDD5]">
            <Zap className="size-5 text-[#FF4A00]" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#111827]">Zapier</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Automate workflows when customers register, scratch, or redeem — connect to 7,000+ apps.
            </p>
          </div>
        </div>

        <ZapierSettings />
      </div>
    </MerchantShell>
  );
}
