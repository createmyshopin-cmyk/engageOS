import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { MarketingView } from "@/components/merchant/marketing/marketing-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketing — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Marketing page — a read-only feed of launched broadcasts + delivery stats.
 *
 * The RSC shell guards the session and renders the layout; the interactive feed
 * lives in the `MarketingView` client island, which fetches through
 * `/api/v1/marketing/broadcasts` via React Query (HYBRID data-fetch). Composing
 * / sending a broadcast is intentionally NOT here — that flow lives in the
 * WATI console (`/m/wati`); this phase adds no send automation.
 */
export default async function MarketingPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/marketing");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/marketing");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <MarketingView />
    </MerchantShell>
  );
}
