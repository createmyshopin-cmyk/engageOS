import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CampaignWizard } from "@/components/merchant/campaign-wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "New Campaign — EngageOS",
  robots: { index: false, follow: false },
};

export default async function NewCampaignPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const business = await repo.getBusiness<{ name: string; city: string | null }>(
    "name, city"
  );

  return (
    <MerchantShell
      businessName={business?.name ?? repo.session.name}
      city={business?.city ?? null}
      campaignActive={false}
      hideHeader={true}
    >
      <CampaignWizard />
    </MerchantShell>
  );
}
