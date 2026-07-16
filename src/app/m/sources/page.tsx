import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { SourcesManager } from "@/components/merchant/sources-manager";
import type { MerchantSourceRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Traffic Sources — EngageOS",
  robots: { index: false, follow: false },
};

export default async function SourcesPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const biz = await repo.getBusiness<{ name: string; slug: string; city: string | null }>(
    "name, slug, city"
  );
  if (!biz) redirect("/m/login");

  // Active campaigns whose links a source can be attached to. Sources are
  // tenant-wide (the ?src= value works on any campaign link), but we surface
  // the campaign list so the merchant can copy a ready-made tracked URL.
  const { data: campaignRows } = await repo
    .select("campaigns", "slug, name, status")
    .order("created_at", { ascending: false });

  const campaigns = ((campaignRows ?? []) as unknown as Array<{ slug: string; name: string; status: string }>)
    .map((c) => ({ slug: c.slug, name: c.name, status: c.status }));

  let sources: MerchantSourceRow[] = [];
  try {
    sources = await repo.merchantSources();
  } catch (err) {
    console.error("merchant sources error:", err);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return (
    <MerchantShell businessName={biz.name} city={biz.city ?? null}>
      <SourcesManager
        sources={sources}
        campaigns={campaigns}
        businessSlug={biz.slug}
        baseUrl={baseUrl}
      />
    </MerchantShell>
  );
}
