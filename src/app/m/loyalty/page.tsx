import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { LoyaltyView } from "@/components/merchant/loyalty/loyalty-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loyalty — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Loyalty page — a customer's derived RFM/engagement standing. The RSC shell
 * guards the session; the interactive picker + standing live in the
 * `LoyaltyView` client island, which fetches `/api/v1/loyalty/:customerId` via
 * React Query (HYBRID data-fetch). Reuses the customers search hook — no
 * duplicated endpoint.
 */
export default async function LoyaltyPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/loyalty");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/loyalty");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <LoyaltyView />
    </MerchantShell>
  );
}
