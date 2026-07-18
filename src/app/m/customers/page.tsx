import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CustomersView } from "@/components/merchant/customers/customers-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Customers page — the merchant-facing CDP customer directory.
 *
 * The RSC shell only guards the session and renders the layout; the interactive
 * list + 360 drawer live in the `CustomersView` client island, which fetches
 * through the `/api/v1/customers*` API via React Query (HYBRID data-fetch, per
 * the integration plan). No customer data is loaded server-side here — search
 * and infinite scroll are inherently client-driven.
 */
export default async function CustomersPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login");

  return (
    <MerchantShell
      businessName={business.name}
      city={business.city}
      hideHeader={true}
    >
      <CustomersView />
    </MerchantShell>
  );
}
