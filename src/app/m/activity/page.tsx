import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { ActivityView } from "@/components/merchant/activity/activity-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Activity page — the business-wide CDP event stream.
 *
 * The RSC shell only guards the session and renders the layout; the interactive
 * feed (category filters + infinite scroll) lives in the `ActivityView` client
 * island, which fetches through `/api/v1/events` via React Query (HYBRID
 * data-fetch, per the integration plan). No events are loaded server-side here —
 * filtering and infinite scroll are inherently client-driven.
 */
export default async function ActivityPage() {
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
      <ActivityView />
    </MerchantShell>
  );
}
