import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { OrdersView } from "@/components/merchant/orders/orders-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Orders page — the merchant-facing order directory over ingested commerce
 * data. The RSC shell guards the session and renders the layout; the
 * interactive list lives in the `OrdersView` client island, which fetches
 * through `/api/v1/orders` via React Query (HYBRID data-fetch). No order data
 * is loaded server-side — filtering and infinite scroll are client-driven.
 */
export default async function OrdersPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/orders");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/orders");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <OrdersView />
    </MerchantShell>
  );
}
