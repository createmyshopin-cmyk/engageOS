import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getShop } from "@/lib/shopify/store";
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

  const business = await repo.getBusiness<{ name: string; city: string | null; slug: string }>(
    "name, city, slug"
  );
  if (!business?.slug) redirect("/m/login");

  let shopifyConnected = false;
  try {
    const shop = await getShop(repo.businessId);
    if (shop && shop.status === "active" && shop.access_token_enc) {
      shopifyConnected = true;
    }
  } catch (err) {
    console.error("Failed to load Shopify status for campaign wizard:", err);
  }

  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  return (
    <MerchantShell
      businessName={business.name}
      city={business.city ?? null}
      campaignActive={false}
      hideHeader={true}
    >
      <CampaignWizard
        shopifyConnected={shopifyConnected}
        merchantSlug={business.slug}
        baseUrl={baseUrl}
      />
    </MerchantShell>
  );
}
