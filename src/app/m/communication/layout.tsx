import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CommunicationNav } from "@/components/merchant/communication/communication-nav";
import { CommunicationConnectBanner } from "@/components/merchant/communication/connect-banner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Communication — EngageOS",
  robots: { index: false, follow: false },
};

export default async function CommunicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/communication/inbox");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/communication/inbox");

  let wacrmConnected = false;
  try {
    const integration = await getWacrmIntegration(repo.businessId);
    wacrmConnected = !!integration && integration.status !== "disconnected";
  } catch {
    /* non-fatal */
  }

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-black text-[#111827]">Communication</h1>
          <p className="text-xs text-[#6B7280] font-medium mt-1">
            WhatsApp inbox, contacts, and broadcasts — powered by WACRM
          </p>
        </div>

        <CommunicationNav />

        {!wacrmConnected && <CommunicationConnectBanner />}
        {children}
      </div>
    </MerchantShell>
  );
}
