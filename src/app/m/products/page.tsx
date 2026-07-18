import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { ProductsView } from "@/components/merchant/products/products-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Products page — the merchant-facing catalog over ingested Shopify products.
 * The RSC shell guards the session; the interactive grid lives in the
 * `ProductsView` client island fetching `/api/v1/products` via React Query
 * (HYBRID data-fetch). Search + infinite scroll are client-driven.
 */
export default async function ProductsPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/products");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/products");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <ProductsView />
    </MerchantShell>
  );
}
