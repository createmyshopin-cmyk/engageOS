import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { GoogleSheetsSettings } from "@/components/merchant/google-sheets/google-sheets-settings";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Google Sheets — EngageOS",
  robots: { index: false, follow: false },
};

export default async function GoogleSheetsIntegrationPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations/google-sheets");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations/google-sheets");

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
          <div className="flex items-center justify-center size-10 rounded-2xl bg-[#ECFDF5] border border-[#D1FAE5]">
            <FileSpreadsheet className="size-5 text-[#059669]" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#111827]">Google Sheets</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Sync customer data and Shopify coupon codes to your spreadsheet with Apps Script.
            </p>
          </div>
        </div>

        <GoogleSheetsSettings />
      </div>
    </MerchantShell>
  );
}
