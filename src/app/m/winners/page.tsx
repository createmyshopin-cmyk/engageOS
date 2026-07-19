import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { WinnersView } from "@/components/merchant/winners/winners-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Winners — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Winners page — live prize feed across all campaigns.
 *
 * The RSC shell guards the session and renders the layout; the interactive
 * list, filters, and customer drawer live in the `WinnersView` client island,
 * which fetches through `/api/v1/winners*` via React Query.
 */
export default async function WinnersPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader>
      <WinnersView />
    </MerchantShell>
  );
}
