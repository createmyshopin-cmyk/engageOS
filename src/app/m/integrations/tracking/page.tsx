import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { TrackingSettings } from "@/components/merchant/tracking/tracking-settings";
import { ArrowLeft, Radar } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketing Tracking — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Marketing Tracking settings. Merchants connect advertising pixels / tags
 * (Meta, GA4, GTM, TikTok, Clarity, Microsoft Ads, LinkedIn, Pinterest) that
 * fire the customer journey to their ad platforms. Only publishable pixel IDs
 * are stored — no server secrets — so IDs are validated (not encrypted) and
 * surfaced to the customer browser for the current live campaign only.
 */
export default async function TrackingIntegrationPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/integrations/tracking");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/integrations/tracking");

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
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#111827] text-white">
            <Radar className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-black text-[#111827]">Marketing Tracking</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Connect your advertising pixels and tags. EngageOS fires the full
              customer journey — scans, registrations, scratches, rewards and
              redirects — to every platform you enable.
            </p>
          </div>
        </div>

        <TrackingSettings />
      </div>
    </MerchantShell>
  );
}
