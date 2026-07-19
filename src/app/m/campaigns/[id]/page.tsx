import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CampaignStatusBadge, CampaignTypeBadge } from "@/components/merchant/campaigns-ui";
import { CampaignDetailTabs } from "@/components/merchant/campaign-detail-tabs";
import { CampaignEventsTimeline } from "@/components/merchant/campaign-events-timeline";
import type { Campaign, Prize, Customer } from "@/lib/types";
import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaign — EngageOS",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");
  const session = repo.session;

  const { id } = await params;

  // Tenant-isolated: campaign must belong to this merchant's business.
  const campaign = await repo.getCampaign<Campaign>(
    id,
    "id, name, slug, headline, description, banner_url, logo_url, terms, coupon_prefix, status, campaign_type, starts_at, ends_at, created_at, business_id, redirect_enabled, redirect_delay, redirect_destination_type, redirect_url, exp_preloader_enabled, exp_preloader_duration, exp_confetti_enabled, exp_sound_enabled, exp_haptics_enabled, exp_open_native_app, exp_show_countdown, exp_allow_skip, exp_button_text, exp_theme"
  );

  if (!campaign) notFound();

  // Immutable "campaign viewed" event (merchant opened the detail page).
  // Best-effort; recordEvent never throws.
  await repo.recordEvent("campaign.viewed", id, { slug: campaign.slug });

  const [
    { data: prizes },
    { count: waSent },
    { count: waFailed },
    { data: recentCustomers },
    { data: couponsByPrize },
    funnel,
    totals,
    timeline,
    activity,
    rewardPerf,
    redirectStats,
  ] = await Promise.all([
    repo.selectPrizes(id, "*"),
    // WhatsApp counts stay wa_status-sourced — WA lifecycle is not yet
    // event-sourced (tracking audit GAP-3, deferred).
    repo.select("coupons", "id", { count: "exact", head: true }).eq("campaign_id", id).eq("wa_status", "sent"),
    repo.select("coupons", "id", { count: "exact", head: true }).eq("campaign_id", id).eq("wa_status", "failed"),
    repo.select("customers", "id, name, phone, created_at").order("created_at", { ascending: false }).limit(50),
    repo.select("coupons", "prize_name, status").eq("campaign_id", id),
    repo.campaignFunnel(id),
    // KPIs now read from the immutable event log (single source of truth).
    repo.campaignEventTotals(id),
    // Unified campaign_events: recent lifecycle timeline + activity rollup.
    repo.campaignTimeline(id, 25),
    repo.campaignActivitySummary(id),
    repo.rewardPerformance(id),
    repo.redirectAnalytics(id),
  ]);

  const plays = totals.plays;
  const wins = totals.wins;
  const redeemed = totals.redeemed;
  const customers = totals.customers;
  const winRate = plays > 0 ? Math.round((wins / plays) * 100) : 0;

  // Aggregate coupons by prize name
  const couponRows = (couponsByPrize ?? []) as unknown as Array<{
    prize_name: string;
    status: string;
  }>;
  const couponStats: Record<string, { issued: number; redeemed: number; remaining: number }> = {};
  for (const c of couponRows) {
    const name = c.prize_name;
    if (!couponStats[name]) couponStats[name] = { issued: 0, redeemed: 0, remaining: 0 };
    couponStats[name].issued++;
    if (c.status === "redeemed") couponStats[name].redeemed++;
  }
  for (const key of Object.keys(couponStats)) {
    couponStats[key].remaining = couponStats[key].issued - couponStats[key].redeemed;
  }

  const business = await repo.getBusiness<{ name: string; city: string | null }>(
    "name, city"
  );

  const couponDropStats =
    campaign.campaign_type === "coupon_drop"
      ? await repo.couponDropStats(id)
      : null;

  return (
    <MerchantShell businessName={business?.name ?? session.name} city={business?.city ?? null} campaignActive={campaign.status === "active"}>
      {/* Back */}
      <div className="mb-4">
        <Link href="/m/campaigns" className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-900 transition-colors">
          <ArrowLeft className="size-4" />
          Campaigns
        </Link>
      </div>

      {/* Campaign Header */}
      <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-sm overflow-hidden mb-6">
        {campaign.banner_url && (
          <div className="h-40 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.banner_url} alt={campaign.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-black text-neutral-900">{campaign.name}</h1>
                <CampaignStatusBadge status={campaign.status} />
                <CampaignTypeBadge type={campaign.campaign_type} />
              </div>
              <p className="text-sm text-neutral-500 mt-1">{campaign.headline}</p>
            </div>
            <Link
              href={`/m/campaigns/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 transition-colors"
            >
              <Edit className="size-3.5" />
              Edit Campaign
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
            <QuickStat label="QR Scans" value={plays} />
            <QuickStat label="Customers" value={customers} />
            <QuickStat label="Redeemed" value={redeemed} />
            <QuickStat label="WA Sent" value={waSent ?? 0} />
            <QuickStat label="Win Rate" value={`${winRate}%`} highlight />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <CampaignDetailTabs
        campaign={campaign}
        prizes={(prizes ?? []) as unknown as Prize[]}
        recentCustomers={(recentCustomers ?? []) as unknown as Customer[]}
        couponStats={couponStats}
        stats={{ plays, wins, redeemed, customers, waSent: waSent ?? 0, waFailed: waFailed ?? 0, winRate }}
        funnel={funnel}
        rewardPerf={rewardPerf}
        redirectStats={redirectStats}
      />

      {couponDropStats && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
            <h3 className="text-sm font-black text-[#111827]">Coupon Drop — Shopify Discount Codes</h3>
            {couponDropStats.fallback_issued > 0 && (
              <span className="text-[11px] font-semibold text-amber-600">
                {couponDropStats.fallback_issued} fallback code{couponDropStats.fallback_issued === 1 ? "" : "s"} need reconciliation
              </span>
            )}
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <HealthStat label="Codes Issued" value={couponDropStats.codes_minted} />
            <HealthStat label="Active" value={couponDropStats.codes_available} />
            <HealthStat label="Linked to Shopify" value={couponDropStats.codes_claimed} />
            <HealthStat label="Redeemed" value={couponDropStats.codes_redeemed} />
            <HealthStat label="Orders Attributed" value={couponDropStats.orders_attributed} />
            <div>
              <div className="text-xl font-black text-emerald-600">
                {formatCurrency(couponDropStats.gross_sales_attributed, couponDropStats.currency)}
              </div>
              <div className="text-[11px] text-neutral-500 font-semibold mt-0.5">Gross Sales</div>
            </div>
            <div>
              <div className="text-xl font-black text-neutral-900">
                {formatCurrency(couponDropStats.avg_order_value, couponDropStats.currency)}
              </div>
              <div className="text-[11px] text-neutral-500 font-semibold mt-0.5">Avg Order Value</div>
            </div>
            <HealthStat label="Fallback Issued" value={couponDropStats.fallback_issued} />
          </div>
          <p className="px-5 pb-5 text-[11px] text-neutral-500 leading-relaxed">
            Customer codes like <span className="font-mono font-semibold">SINDUR0122-XXXX</span> are
            added inside Shopify under{" "}
            <strong>Discounts → your campaign title (parent discount) → Codes</strong> — not as separate
            discounts in the list. Search the exact code in the Codes tab of the parent discount.
          </p>
        </div>
      )}

      {/* Campaign Timeline + Health — from the immutable campaign_events log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <CampaignEventsTimeline events={timeline} />
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h3 className="text-sm font-black text-[#111827]">Campaign Health</h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4">
            <HealthStat label="Total Events" value={activity.total_events} />
            <HealthStat label="Distinct Actors" value={activity.distinct_actors} />
            <HealthStat label="Views" value={activity.views} />
            <HealthStat label="Scans" value={activity.scans} />
            <HealthStat label="Registrations" value={activity.registrations} />
            <HealthStat label="Redemptions" value={activity.redemptions} />
          </div>
          <div className="px-5 pb-5 -mt-1">
            <p className="text-[10px] text-[#9CA3AF] font-medium">
              {activity.last_activity
                ? `Last activity ${new Date(activity.last_activity).toLocaleString()}`
                : "No activity recorded yet"}
            </p>
          </div>
        </div>
      </div>
    </MerchantShell>
  );
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
  }
}

function HealthStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-black text-neutral-900">{value}</div>
      <div className="text-[11px] text-neutral-500 font-semibold mt-0.5">{label}</div>
    </div>
  );
}

function QuickStat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-3 text-center">
      <div className={`text-xl font-black ${highlight ? "text-emerald-600" : "text-neutral-900"}`}>{value}</div>
      <div className="text-[11px] text-neutral-500 font-semibold mt-0.5">{label}</div>
    </div>
  );
}
