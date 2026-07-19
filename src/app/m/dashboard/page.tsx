import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import type { Prize, CampaignStatus } from "@/lib/types";
import { istDateRangeToTimestamps, todayIstDate } from "@/lib/merchant/ist-date";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { DashboardView } from "@/components/merchant/dashboard/dashboard-view";
import type { DashboardCampaign } from "@/components/merchant/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard — EngageOS",
  robots: { index: false, follow: false },
};

export default async function MerchantDashboardPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");
  const session = repo.session;

  const [business, { data: rawCampaigns, error: campaignsError }] = await Promise.all([
    repo.getBusiness<{ name: string; city: string | null; slug: string }>("name, city, slug"),
    repo
      .select(
        "campaigns",
        "id, name, slug, status, starts_at, ends_at, headline, banner_url, logo_url, created_at, business_id"
      )
      .order("created_at", { ascending: false }),
  ]);
  if (campaignsError) throw new Error("Failed to load dashboard");

  const firstCampaignId = (rawCampaigns?.[0] as unknown as { id: string } | undefined)?.id;
  const { from: startOfTodayIst } = istDateRangeToTimestamps(todayIstDate(), null);

  const [
    stats,
    prizesResult,
    recentCustomers,
    customersToday,
    recentEvents,
    trafficSources,
    totals,
    dailyActivity,
  ] = await Promise.all([
    repo.campaignStats(),
    firstCampaignId
      ? repo.selectPrizes(firstCampaignId, "*")
      : Promise.resolve({ data: [] as unknown[], error: null }),
    repo.recentCustomers(8),
    repo.countCustomersSince(startOfTodayIst!),
    repo.recentEvents(8),
    repo.trafficSources(),
    repo.businessEventTotals(),
    repo.businessDailyActivity(7),
  ]);
  if (prizesResult.error) throw new Error("Failed to load dashboard prizes");

  const campaigns: DashboardCampaign[] = (rawCampaigns ?? []).map((c: any) => {
    const s = stats.get(c.id);
    const plays = s?.plays ?? 0;
    const wins = s?.wins ?? 0;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status as CampaignStatus,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      headline: c.headline ?? null,
      banner_url: c.banner_url ?? null,
      plays,
      wins,
      redeemed: s?.redeemed ?? 0,
      wa_sent: s?.wa_sent ?? 0,
      remaining_coupons: s?.remaining_coupons ?? 0,
      win_rate: plays > 0 ? Math.round((wins / plays) * 100) : 0,
    };
  });

  const prizes: Prize[] = (prizesResult.data ?? []) as unknown as Prize[];

  return (
    <MerchantShell
      businessName={business?.name ?? session.name}
      city={business?.city ?? null}
      campaignActive={campaigns.some((c) => c.status === "active")}
      hideHeader={true}
    >
      <DashboardView
        businessName={business?.name ?? session.name}
        city={business?.city ?? null}
        merchantSlug={business?.slug ?? ""}
        campaigns={campaigns}
        prizes={prizes}
        customers={recentCustomers}
        recent={recentEvents}
        trafficSources={trafficSources}
        totals={totals}
        dailyActivity={dailyActivity}
        customersToday={customersToday}
      />
    </MerchantShell>
  );
}
