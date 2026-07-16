import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getAllCustomers } from "@/lib/db/merchant";
import type { Customer, Campaign, Prize, CampaignStatus } from "@/lib/types";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import {
  Users,
  Gift,
  MessageSquare,
  Printer,
  Plus,
  Bell,
  Search,
  FileText,
  Sparkles,
} from "lucide-react";
import { DashboardActions } from "@/components/merchant/dashboard-actions";
import {
  eventMeta,
  timeAgo,
  ACTOR_LABEL,
} from "@/components/merchant/campaign-events-timeline";
import type { RecentCampaignEvent, TrafficSourceRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merchant Dashboard — EngageOS",
  robots: { index: false, follow: false },
};

type CampaignWithStats = {
  id: string;
  name: string;
  slug: string;
  status: CampaignStatus;
  starts_at: string;
  ends_at: string;
  headline: string | null;
  banner_url: string | null;
  logo_url: string | null;
  created_at: string;
  business_id: string;
  plays: number;
  wins: number;
  redeemed: number;
  wa_sent: number;
  remaining_coupons: number;
  win_rate: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MerchantDashboardPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");
  const session = repo.session;

  const business = await repo.getBusiness<{ name: string; city: string | null; slug: string }>(
    "name, city, slug"
  );

  // Campaigns for this tenant, newest first (repository is tenant-scoped).
  const { data: rawCampaigns, error: campaignsError } = await repo
    .select(
      "campaigns",
      "id, name, slug, status, starts_at, ends_at, headline, banner_url, logo_url, created_at, business_id"
    )
    .order("created_at", { ascending: false });
  if (campaignsError) throw new Error("Failed to load dashboard");

  // Per-campaign stats + all prizes + recent activity in parallel.
  const [stats, { data: allPrizes }, customers, recentEvents, trafficSources] = await Promise.all([
    repo.campaignStats(),
    repo.selectAllPrizes("*"),
    getAllCustomers(repo.businessId),
    repo.recentEvents(8),
    repo.trafficSources(),
  ]);

  const prizesByCampaign = new Map<string, Prize[]>();
  for (const p of (allPrizes ?? []) as unknown as Prize[]) {
    const list = prizesByCampaign.get(p.campaign_id) ?? [];
    list.push(p);
    prizesByCampaign.set(p.campaign_id, list);
  }

  const campaigns: CampaignWithStats[] = (rawCampaigns ?? []).map((c: any) => {
    const s = stats.get(c.id);
    const plays = s?.plays ?? 0;
    const wins = s?.wins ?? 0;
    return {
      ...c,
      plays,
      wins,
      redeemed: s?.redeemed ?? 0,
      wa_sent: s?.wa_sent ?? 0,
      remaining_coupons: s?.remaining_coupons ?? 0,
      win_rate: plays > 0 ? Math.round((wins / plays) * 100) : 0,
    };
  });

  // Rewards Summary shows the first (newest) campaign's prizes.
  const prizes: Prize[] =
    campaigns.length > 0 ? prizesByCampaign.get(campaigns[0].id) ?? [] : [];

  const recent = recentEvents as RecentCampaignEvent[];

  // Derive metrics
  const totalPlays = campaigns.reduce((s, c) => s + c.plays, 0);
  const totalRedeemed = campaigns.reduce((s, c) => s + c.redeemed, 0);
  const totalWaSent = campaigns.reduce((s, c) => s + c.wa_sent, 0);
  const totalCouponsRemaining = campaigns.reduce((s, c) => s + c.remaining_coupons, 0);

  // Today's Joins
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const customersToday = customers.filter(
    (c) => new Date(c.created_at).getTime() >= startOfToday.getTime()
  ).length;

  const activeCampaign = campaigns.find((c) => c.status === "active");
  const merchantSlug = business?.slug ?? "";

  // Chart data calculations
  const chartDays = 7;
  const chartData = [];
  const now = new Date();
  for (let i = chartDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const joins = customers.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    }).length;

    chartData.push({
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      value: joins,
    });
  }

  // SVG Chart path calculation
  const maxChartVal = Math.max(...chartData.map((d) => d.value), 4);
  const svgWidth = 500;
  const svgHeight = 150;
  const padding = 25;
  const chartPoints = chartData.map((d, index) => {
    const x = padding + (index * (svgWidth - padding * 2)) / (chartDays - 1);
    const y = svgHeight - padding - (d.value * (svgHeight - padding * 2)) / maxChartVal;
    return { x, y, label: d.label, val: d.value };
  });

  const pathD = chartPoints.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  // Gradient fill area
  const areaD = pathD
    ? `${pathD} L ${chartPoints[chartPoints.length - 1].x} ${svgHeight - padding} L ${chartPoints[0].x} ${svgHeight - padding} Z`
    : "";

  return (
    <MerchantShell
      businessName={business?.name ?? session.name}
      city={business?.city ?? null}
      campaignActive={campaigns.some((c) => c.status === "active")}
      hideHeader={true}
    >
      <div className="space-y-8 pb-12">
        {/* ── Top Header ── */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-1.5">
                Campaigns
                <span className="text-emerald-500 font-bold">↗</span>
              </h1>
            </div>
            <p className="text-xs text-neutral-500">Create and manage your customer engagement campaigns.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
            {/* WhatsApp Connected status */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-bold border border-[#16A34A]/20">
              <span className="size-1.5 rounded-full bg-[#16A34A] animate-pulse" />
              WhatsApp Connected
            </span>

            {/* Notification bell */}
            <button className="relative flex items-center justify-center size-9 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] transition-colors cursor-pointer">
              <Bell className="size-4.5 text-[#374151]" />
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#EF4444]" />
            </button>

            {/* Profile Avatar */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center size-9 rounded-xl bg-[#16A34A] text-white text-xs font-black">
                {(business?.name ?? session.name).slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-neutral-900">{business?.name ?? session.name}</p>
                <p className="text-[10px] text-neutral-400 font-semibold">{business?.city ?? "Wayanad, Kerala"}</p>
              </div>
            </div>

            {/* New Campaign Button */}
            <Link
              href="/m/campaigns/new"
              className="inline-flex items-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-green-500/20"
            >
              <Plus className="size-4" />
              New Campaign
            </Link>
          </div>
        </header>

        {/* ── Filters Bar ── */}
        <div className="flex flex-wrap gap-3 bg-white border border-neutral-200/80 p-3 rounded-2xl">
          <div className="relative flex-1 min-w-[240px]">
            <input
              type="text"
              placeholder="Search campaigns..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 transition"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
          </div>

          <select className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none cursor-pointer">
            <option>Status: All</option>
            <option>Active</option>
            <option>Scheduled</option>
            <option>Paused</option>
          </select>

          <select className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none cursor-pointer">
            <option>Date: All Time</option>
            <option>Last 7 Days</option>
            <option>Last 30 Days</option>
          </select>
        </div>

        {/* ── Campaigns Grid ── */}
        {campaigns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow group"
              >
                {/* Banner */}
                <div className="relative h-32 bg-neutral-900 overflow-hidden">
                  {c.banner_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.banner_url} alt={c.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
                      <span className="text-white/20 font-black text-xs uppercase tracking-wider">{c.name}</span>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    <StatusBadge status={c.status} />
                  </div>
                </div>

                {/* Details */}
                <div className="p-5 flex flex-col flex-1 gap-4">
                  <div>
                    <h3 className="font-black text-neutral-900 text-sm line-clamp-1">{c.name}</h3>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Scratch & Win
                      </span>
                      <span className="text-[10px] text-neutral-400 font-semibold">
                        {formatDate(c.starts_at)} - {formatDate(c.ends_at)}
                      </span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-neutral-50 rounded-2xl p-3">
                    <MiniStat label="Scans" val={c.plays} />
                    <MiniStat label="Customers" val={c.plays} />
                    <MiniStat label="Redeemed" val={c.redeemed} />
                    <MiniStat label="WA Sent" val={c.wa_sent} />
                    <MiniStat label="Remaining" val={c.remaining_coupons} />
                    <MiniStat label="Win Rate" val={c.plays > 0 ? `${c.win_rate}%` : "—"} highlight={c.plays > 0} />
                  </div>

                  {/* Actions Dropdown / Panel */}
                  <div className="mt-auto pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                    <DashboardActions campaign={c} merchantSlug={merchantSlug} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Sub Sections ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Performance Overview & Line Chart */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-neutral-900 text-sm">Campaign Performance Overview</h3>
                <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">Scans collected over the last 7 days</p>
              </div>
              <select className="px-2.5 py-1.5 text-[10px] font-bold bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none cursor-pointer">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
              </select>
            </div>

            {/* SVG Line Chart */}
            <div className="relative">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Y-axis gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                  const y = padding + r * (svgHeight - padding * 2);
                  return (
                    <line key={i} x1={padding} y1={y} x2={svgWidth - padding} y2={y} stroke="#F3F4F6" strokeWidth="1" />
                  );
                })}

                {/* Area under line */}
                {areaD && <path d={areaD} fill="url(#gradient)" />}

                {/* Line Path */}
                {pathD && <path d={pathD} fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />}

                {/* Point dots */}
                {chartPoints.map((p, i) => (
                  <g key={i} className="group/dot cursor-pointer">
                    <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#16A34A" strokeWidth="2.5" />
                    <circle cx={p.x} cy={p.y} r="8" fill="#16A34A" className="opacity-0 hover:opacity-10 transition-opacity" />
                    {/* Tooltip on hover */}
                    <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] font-bold fill-neutral-800 opacity-0 group-hover/dot:opacity-100 transition-opacity bg-white">
                      {p.val}
                    </text>
                  </g>
                ))}

                {/* X Axis labels */}
                {chartPoints.map((p, i) => (
                  <text key={i} x={p.x} y={svgHeight - 8} textAnchor="middle" className="text-[8px] font-bold fill-neutral-400">
                    {p.label}
                  </text>
                ))}
              </svg>
            </div>

            {/* Micro Stats Spark Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-100">
              <MicroStat label="QR Scans" val={totalPlays} pct="+18%" />
              <MicroStat label="Customers" val={totalPlays} pct="+16%" />
              <MicroStat label="Coupons Redeemed" val={totalRedeemed} pct="+22%" />
              <MicroStat label="WhatsApp Sent" val={totalWaSent} pct="+17%" />
            </div>
          </div>

          {/* Recent Customers */}
          <div className="lg:col-span-3 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-neutral-900 text-sm">Recent Customers</h3>
              <Link href="/m/dashboard/customers.csv" className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700">
                View all
              </Link>
            </div>

            {customers.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">No customers registered yet.</p>
            ) : (
              <div className="space-y-3.5">
                {customers.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-8 rounded-xl bg-neutral-100 text-neutral-700 text-xs font-black shrink-0">
                      {c.name ? c.name.slice(0, 2).toUpperCase() : "CU"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-neutral-900 truncate">{c.name || "Customer"}</p>
                      <p className="text-[10px] text-neutral-400 font-semibold">{c.phone}</p>
                    </div>
                    <span className="text-[9px] font-black uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md shrink-0 border border-emerald-100">
                      New
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Link
              href="/m/dashboard/customers.csv"
              className="block text-center text-xs font-black text-emerald-600 hover:text-emerald-700 py-1.5 bg-emerald-50/50 rounded-xl transition border border-emerald-100/50"
            >
              View all customers →
            </Link>
          </div>

          {/* Rewards Summary */}
          <div className="lg:col-span-3 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-neutral-900 text-sm">Rewards Summary</h3>
              <Link href="/m/rewards" className="text-[10px] font-bold text-neutral-400 hover:text-neutral-600">View all</Link>
            </div>

            {prizes.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">No prizes configured.</p>
            ) : (
              <div className="space-y-4">
                {prizes.map((p, i) => {
                  const redeemed = p.won_count;
                  const pct = Math.round((redeemed / Math.max(p.total_quantity, 1)) * 100);
                  const remaining = Math.max(p.total_quantity - p.won_count, 0);
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-neutral-800 truncate max-w-[130px]">{p.name}</span>
                        <span className="font-black text-neutral-900 shrink-0">{remaining} Remaining</span>
                      </div>
                      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#16A34A] rounded-full transition-all" style={{ width: `${100 - pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Traffic Sources ── */}
        <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-neutral-900 text-sm">Traffic Sources</h3>
              <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                Where your scans, plays and redemptions come from. Add{" "}
                <span className="font-mono text-neutral-500">?src=name</span> to a campaign link to track it.
              </p>
            </div>
          </div>

          {trafficSources.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">
              No traffic yet. Sources appear here once customers start scanning.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-neutral-100 text-[9px] uppercase tracking-wider text-neutral-400 font-black">
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 px-3 text-right">QR Scans</th>
                    <th className="py-2 px-3 text-right">Registrations</th>
                    <th className="py-2 px-3 text-right">Plays</th>
                    <th className="py-2 px-3 text-right">Wins</th>
                    <th className="py-2 pl-3 text-right">Redemptions</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficSources.map((s) => (
                    <tr key={s.source} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-neutral-100 text-neutral-700">
                          {s.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs font-bold text-neutral-900">{s.qr_scans}</td>
                      <td className="py-2.5 px-3 text-right text-xs font-bold text-neutral-900">{s.registrations}</td>
                      <td className="py-2.5 px-3 text-right text-xs font-bold text-neutral-900">{s.plays}</td>
                      <td className="py-2.5 px-3 text-right text-xs font-bold text-neutral-900">{s.wins}</td>
                      <td className="py-2.5 pl-3 text-right text-xs font-black text-[#16A34A]">{s.redemptions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Bottom Section (Timeline + Focus / Actions) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Recent Activity Timeline */}
          <div className="lg:col-span-6 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-6">
            <h3 className="font-black text-neutral-900 text-sm">Recent Activity</h3>
            {recent.length === 0 ? (
              <p className="text-xs text-neutral-400 font-medium py-4">
                No activity yet. Events appear here as your campaigns run.
              </p>
            ) : (
              <div className="relative border-l border-neutral-100 pl-4.5 ml-2.5 space-y-6">
                {recent.map((e) => {
                  const m = eventMeta(e.event_type);
                  const Icon = m.icon;
                  return (
                    <div key={e.id} className="relative">
                      <div className={`absolute -left-[26px] top-0.5 size-5 rounded-full flex items-center justify-center ${m.tone}`}>
                        <Icon className="size-3" />
                      </div>
                      <p className="text-xs font-bold text-neutral-900 leading-tight">
                        {m.label}
                        {e.campaign_name && (
                          <span className="font-medium text-neutral-500"> · {e.campaign_name}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-1 font-medium">
                        {ACTOR_LABEL[e.actor_type] ?? e.actor_type} · {timeAgo(e.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions & Focus Panel */}
          <div className="lg:col-span-6 space-y-6">
            {/* Quick Actions Card */}
            <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-5">
              <h3 className="font-black text-neutral-900 text-sm">Quick Actions</h3>
              <div className="grid grid-cols-3 gap-3">
                <QuickActionItem label="New Campaign" icon={<Plus className="size-4" />} href="/m/campaigns/new" />
                <QuickActionItem label="Print QR" icon={<Printer className="size-4" />} href={activeCampaign && merchantSlug ? `/m/campaigns/print/${merchantSlug}/${activeCampaign.slug}` : "#"} />
                <QuickActionItem label="Send WhatsApp" icon={<MessageSquare className="size-4" />} href="#" />
                <QuickActionItem label="View Customers" icon={<Users className="size-4" />} href="/m/dashboard/customers.csv" />
                <QuickActionItem label="Rewards" icon={<Gift className="size-4" />} href="/m/rewards" />
                <QuickActionItem label="Reports" icon={<FileText className="size-4" />} href="#" />
              </div>
            </div>

            {/* Today's Focus Card */}
            <div className="bg-[#16A34A] text-white rounded-3xl p-6 space-y-4 shadow-lg shadow-green-500/15 relative overflow-hidden">
              <div className="absolute top-0 right-0 size-28 bg-white/5 rounded-full -mr-8 -mt-8" />
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-emerald-200" />
                  <h3 className="font-black text-white text-base">🎯 Today's Focus</h3>
                </div>
                <p className="text-[10px] text-emerald-100 font-bold uppercase tracking-wider mt-0.5">Recommendations for today</p>
              </div>

              <ul className="space-y-2 text-xs font-semibold text-emerald-50">
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                  {totalCouponsRemaining} coupons remaining in active campaigns.
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                  {customersToday} customers joined your business today.
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                  Best time to send WhatsApp: 5:00 PM – 7:00 PM
                </li>
              </ul>

              <button className="w-full py-2.5 bg-white text-[#16A34A] hover:bg-emerald-50 rounded-xl text-xs font-black transition shadow-sm cursor-pointer">
                Send Campaign
              </button>
            </div>
          </div>
        </div>
      </div>
    </MerchantShell>
  );
}

/* ── Mini Helpers ─── */

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-[#22C55E] text-white" },
    scheduled: { label: "Scheduled", cls: "bg-blue-500 text-white" },
    paused: { label: "Paused", cls: "bg-[#F59E0B] text-white" },
    draft: { label: "Draft", cls: "bg-neutral-500 text-white" },
    completed: { label: "Ended", cls: "bg-neutral-400 text-white" },
  };

  const cfg = configs[status] ?? configs.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider backdrop-blur-sm ${cfg.cls}`}>
      <span className="size-1 rounded-full bg-white animate-pulse" />
      {cfg.label}
    </span>
  );
}

function MiniStat({ label, val, highlight = false }: { label: string; val: string | number; highlight?: boolean }) {
  return (
    <div className="flex flex-col text-center">
      <span className={`text-sm font-black ${highlight ? "text-[#16A34A]" : "text-neutral-900"}`}>{val}</span>
      <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-wider mt-0.5">{label}</span>
    </div>
  );
}

function MicroStat({ label, val, pct }: { label: string; val: number; pct: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-base font-black text-neutral-900">{val}</span>
        <span className="text-[10px] font-bold text-[#22C55E]">{pct}</span>
      </div>
    </div>
  );
}

function QuickActionItem({ label, icon, href }: { label: string; icon: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-neutral-200/70 bg-white hover:border-[#16A34A]/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-center size-9 rounded-xl bg-neutral-50 text-neutral-600 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-neutral-700 text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] bg-white border border-neutral-200/80 rounded-3xl p-8 text-center">
      <div className="size-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <Sparkles className="size-8 text-[#16A34A]" />
      </div>
      <h3 className="font-black text-neutral-900 text-base">No campaigns found</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">Get started by creating your first Scratch & Win customer engagement campaign.</p>
      <Link href="/m/campaigns/new" className="mt-5 inline-flex items-center gap-2 bg-[#16A34A] text-white text-xs font-bold px-4 py-2.5 rounded-xl">
        <Plus className="size-4" />
        New Campaign
      </Link>
    </div>
  );
}
