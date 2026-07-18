import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { AnalyticsView } from "@/components/merchant/analytics/analytics-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Analytics page — engagement KPIs, campaign leaderboard and traffic sources.
 *
 * The RSC shell guards the session and renders the layout; the interactive
 * dashboards live in the `AnalyticsView` client island, which fetches through
 * `/api/v1/analytics/overview` + `/api/v1/analytics/performance` via React
 * Query (HYBRID data-fetch). No direct DB access, no tenant id sent from the
 * client — both aggregates are tenant-scoped server-side.
 */
export default async function AnalyticsPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/analytics");

  const business = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!business) redirect("/m/login?from=/m/analytics");

  return (
    <MerchantShell businessName={business.name} city={business.city} hideHeader={true}>
      <AnalyticsView />
    </MerchantShell>
  );
}
