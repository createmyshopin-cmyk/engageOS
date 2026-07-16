import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CampaignStatusBadge, CampaignActions, EmptyState } from "@/components/merchant/campaigns-ui";
import type { Campaign, Prize } from "@/lib/types";
import { QrCode, Users, Gift, MessageSquare, BarChart3, Plus, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaigns — EngageOS",
  robots: { index: false, follow: false },
};

type CampaignWithStats = Campaign & {
  plays: number;
  wins: number;
  redeemed: number;
  customers: number;
  wa_sent: number;
  remaining_coupons: number;
  prizes: Prize[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function winRate(plays: number, wins: number): string | null {
  if (plays === 0) return null;
  return `${Math.round((wins / plays) * 100)}%`;
}

export default async function CampaignsPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");
  const session = repo.session;

  // Fetch campaigns (tenant-scoped by the repository).
  const { data: rawCampaigns, error } = await repo
    .select(
      "campaigns",
      `
      id, name, slug, headline, description, banner_url, logo_url, terms,
      coupon_prefix, status, starts_at, ends_at, created_at, business_id
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Campaigns fetch error:", error);
    throw new Error("Failed to load campaigns");
  }

  // Tenant-wide customer count is the same across a business's campaigns.
  const businessCustomers = await repo.count("customers");

  // Per-campaign stats in ONE aggregate round-trip + one prizes fetch,
  // instead of a 6-query fan-out per campaign.
  const [stats, { data: allPrizes }] = await Promise.all([
    repo.campaignStats(),
    repo.selectAllPrizes("*"),
  ]);

  const prizesByCampaign = new Map<string, Prize[]>();
  for (const p of ((allPrizes ?? []) as unknown as Prize[])) {
    const list = prizesByCampaign.get(p.campaign_id) ?? [];
    list.push(p);
    prizesByCampaign.set(p.campaign_id, list);
  }

  const campaigns: CampaignWithStats[] = (rawCampaigns ?? []).map((c: any) => {
    const s = stats.get(c.id);
    return {
      ...c,
      plays: s?.plays ?? 0,
      wins: s?.wins ?? 0,
      redeemed: s?.redeemed ?? 0,
      customers: businessCustomers,
      wa_sent: s?.wa_sent ?? 0,
      remaining_coupons: s?.remaining_coupons ?? 0,
      prizes: prizesByCampaign.get(c.id) ?? [],
    };
  });

  // Fetch business details for shell and merchant ID
  const business = await repo.getBusiness<{
    name: string;
    city: string | null;
    slug: string;
    public_id: string;
  }>("name, city, slug, public_id");

  return (
    <MerchantShell
      businessName={business?.name ?? session.name}
      city={business?.city ?? null}
      campaignActive={campaigns.some((c) => c.status === "active")}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Campaigns</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Create and manage your customer engagement campaigns.</p>
        </div>
        <Link
          href="/m/campaigns/new"
          className="inline-flex items-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-green-500/20"
        >
          <Plus className="size-4" />
          New Campaign
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="search"
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        <select className="px-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none focus:border-emerald-500 cursor-pointer">
          <option value="">Status: All</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>

        <select className="px-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none focus:border-emerald-500 cursor-pointer">
          <option value="">Date: All Time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Campaign Grid / Empty */}
      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => (
            <article
              key={campaign.id}
              className="bg-white rounded-2xl border border-neutral-200/70 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Banner */}
              <div className="relative h-36 bg-gradient-to-br from-neutral-800 to-neutral-900 overflow-hidden">
                {campaign.banner_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={campaign.banner_url}
                    alt={campaign.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-black text-white/20 uppercase tracking-wider px-4 line-clamp-2">
                        {campaign.name}
                      </div>
                      <div className="text-xs text-white/30 mt-1 font-semibold">Scratch & Win</div>
                    </div>
                  </div>
                )}
                {/* Status badge top-right */}
                <div className="absolute top-3 right-3">
                  <CampaignStatusBadge status={campaign.status} />
                </div>
              </div>

              {/* Card body */}
              <div className="p-4 flex flex-col flex-1 gap-3">
                <div>
                  <h2 className="text-base font-bold text-neutral-900 line-clamp-1">{campaign.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                      Scratch & Win
                    </span>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <CalendarDays className="size-3.5 shrink-0" />
                  <span>{formatDate(campaign.starts_at)} – {formatDate(campaign.ends_at)}</span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={<QrCode className="size-3.5" />} label="QR Scans" value={campaign.plays} />
                  <Stat icon={<Users className="size-3.5" />} label="Customers" value={campaign.customers} />
                  <Stat icon={<Gift className="size-3.5" />} label="Redeemed" value={campaign.redeemed} />
                  <Stat icon={<MessageSquare className="size-3.5" />} label="WA Sent" value={campaign.wa_sent} />
                  <Stat icon={<BarChart3 className="size-3.5" />} label="Remaining" value={campaign.remaining_coupons} />
                  <Stat
                    icon={<span className="text-[10px] font-black">%</span>}
                    label="Win Rate"
                    value={winRate(campaign.plays, campaign.wins) ?? "–"}
                    highlight={campaign.plays > 0}
                  />
                </div>

                {/* Quick Actions */}
                <div className="mt-auto pt-3 border-t border-neutral-100">
                  <CampaignActions
                    campaign={campaign}
                    merchantSlug={business?.slug ?? ""}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </MerchantShell>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-neutral-50 rounded-xl p-2">
      <div className="flex items-center gap-1 text-neutral-400">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-base font-black ${highlight ? "text-emerald-600" : "text-neutral-900"}`}>
        {value}
      </span>
    </div>
  );
}
