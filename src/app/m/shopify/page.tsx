import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { ShopifyView } from "@/components/merchant/shopify/shopify-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopify — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Shopify page — the merchant's store connection + Sync Engine dashboard.
 *
 * The RSC shell guards the session and renders the layout; the interactive
 * surface lives in the `ShopifyView` client island, which fetches through
 * `/api/v1/shopify/*` via React Query (HYBRID data-fetch). When no store is
 * connected it shows a connect form that hands off to `/api/shopify/install`
 * (OAuth); when connected it shows ingestion totals + the live sync dashboard.
 */
export default async function ShopifyPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/shopify");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/shopify");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <Suspense fallback={null}>
        <ShopifyView />
      </Suspense>
    </MerchantShell>
  );
}
