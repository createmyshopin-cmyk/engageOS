"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Gift,
  Send,
  Printer,
  Plus,
  Search,
  FileText,
  Sparkles,
  ScanLine,
  Ticket,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CampaignStatus, Prize, RecentCampaignEvent, TrafficSourceRow } from "@/lib/types";
import { DashboardActions } from "@/components/merchant/dashboard-actions";
import {
  eventMeta,
  timeAgo,
  ACTOR_LABEL,
} from "@/components/merchant/campaign-events-timeline";
import {
  SparkLine,
  AreaTrendChart,
  MiniBarChart,
  FunnelChart,
  DonutChart,
  type ChartPoint,
} from "@/components/merchant/dashboard/dashboard-charts";
import { dayLabel, fillDailySeries } from "@/lib/merchant/daily-series";

export interface DashboardCampaign {
  id: string;
  name: string;
  slug: string;
  status: CampaignStatus;
  starts_at: string;
  ends_at: string;
  headline: string | null;
  banner_url: string | null;
  plays: number;
  wins: number;
  redeemed: number;
  wa_sent: number;
  remaining_coupons: number;
  win_rate: number;
}

export interface DailyActivityRow {
  day: string;
  registrations: number;
  scratches: number;
  coupons: number;
  redemptions: number;
}

export interface DashboardCustomer {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface DashboardProps {
  businessName: string;
  city: string | null;
  merchantSlug: string;
  campaigns: DashboardCampaign[];
  prizes: Prize[];
  customers: DashboardCustomer[];
  recent: RecentCampaignEvent[];
  trafficSources: TrafficSourceRow[];
  totals: {
    customers: number;
    plays: number;
    wins: number;
    coupons: number;
    redeemed: number;
    return_visits: number;
  };
  dailyActivity: DailyActivityRow[];
  customersToday: number;
}

const STATUS_FILTERS: { label: string; value: string | null }[] = [
  { label: "All", value: null },
  { label: "Active", value: "active" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Paused", value: "paused" },
  { label: "Ended", value: "completed" },
];

type ChartMetric = "registrations" | "scratches" | "coupons" | "redemptions";

const CHART_METRICS: { key: ChartMetric; label: string; color: string }[] = [
  { key: "registrations", label: "Sign-ups", color: "#16A34A" },
  { key: "scratches", label: "Scratches", color: "#0EA5E9" },
  { key: "coupons", label: "Coupons", color: "#8B5CF6" },
  { key: "redemptions", label: "Redeemed", color: "#F59E0B" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DashboardView({
  businessName,
  city,
  merchantSlug,
  campaigns,
  prizes,
  customers,
  recent,
  trafficSources,
  totals,
  dailyActivity,
  customersToday,
}: DashboardProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("scratches");

  const filled = useMemo(() => fillDailySeries(dailyActivity, 7), [dailyActivity]);

  const chartSeries: ChartPoint[] = filled.map((d) => ({
    label: dayLabel(d.day),
    value: d[chartMetric],
  }));

  const sparkRegistrations = filled.map((d) => d.registrations);
  const sparkScratches = filled.map((d) => d.scratches);
  const sparkCoupons = filled.map((d) => d.coupons);
  const sparkRedemptions = filled.map((d) => d.redemptions);

  const weekTotal = filled.reduce((s, d) => s + d.scratches, 0);
  const prevWeekHint = weekTotal > 0 ? `${weekTotal} scratches this week` : "No scratches yet";

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.headline ?? "").toLowerCase().includes(q);
  });

  const activeCampaign = campaigns.find((c) => c.status === "active");
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  const trafficBars = trafficSources.map((s) => ({
    label: s.source,
    value: s.plays + s.registrations,
  }));

  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-700 text-white p-6 sm:p-8 shadow-lg shadow-emerald-500/20">
        <div className="absolute top-0 right-0 size-48 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 size-32 bg-teal-400/20 rounded-full blur-xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100/90">
              Merchant dashboard
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
              Welcome back, {businessName.split(" ")[0]}
            </h1>
            <p className="text-sm text-emerald-50/90 mt-2 max-w-lg">
              {activeCount > 0
                ? `${activeCount} active campaign${activeCount === 1 ? "" : "s"} · ${customersToday} new customer${customersToday === 1 ? "" : "s"} today`
                : "Launch a campaign to start collecting customers and rewards."}
              {city ? ` · ${city}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/m/campaigns/new"
              className="inline-flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <Plus className="size-4" />
              New Campaign
            </Link>
            <Link
              href="/m/customers"
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-white/20 transition"
            >
              <Users className="size-4" />
              Customers
            </Link>
          </div>
        </div>
      </header>

      {/* KPI row with sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSparkCard
          icon={Users}
          label="Campaign customers"
          value={totals.customers}
          sub={`${customersToday} today`}
          spark={sparkRegistrations}
          color="#16A34A"
          highlight
        />
        <KpiSparkCard
          icon={ScanLine}
          label="Total scratches"
          value={totals.plays}
          sub={prevWeekHint}
          spark={sparkScratches}
          color="#0EA5E9"
        />
        <KpiSparkCard
          icon={Ticket}
          label="Coupons issued"
          value={totals.coupons}
          sub={`${totals.wins} wins`}
          spark={sparkCoupons}
          color="#8B5CF6"
        />
        <KpiSparkCard
          icon={TrendingUp}
          label="Redeemed"
          value={totals.redeemed}
          sub={`${totals.return_visits} return visits`}
          spark={sparkRedemptions}
          color="#F59E0B"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-neutral-900 text-sm">7-day activity</h3>
              <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">
                Live from your campaign event log
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHART_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setChartMetric(m.key)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                    chartMetric === m.key
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <AreaTrendChart series={chartSeries} />
        </div>

        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-neutral-900 text-sm">Engagement funnel</h3>
            <FunnelChart
              steps={[
                { label: "Customers", value: totals.customers, color: "#16A34A" },
                { label: "Scratches", value: totals.plays, color: "#0EA5E9" },
                { label: "Wins", value: totals.wins, color: "#8B5CF6" },
                { label: "Redeemed", value: totals.redeemed, color: "#F59E0B" },
              ]}
            />
          </div>
          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-neutral-900 text-sm">Win breakdown</h3>
            <DonutChart
              segments={[
                { label: "Wins", value: totals.wins, color: "#16A34A" },
                { label: "Losses", value: Math.max(totals.plays - totals.wins, 0), color: "#E5E7EB" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Campaign filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500 transition"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <FilterPill
              key={f.label}
              active={statusFilter === f.value}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Campaigns */}
      {filteredCampaigns.length === 0 ? (
        <EmptyCampaigns hasCampaigns={campaigns.length > 0} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredCampaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} merchantSlug={merchantSlug} />
          ))}
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-neutral-900 text-sm">Traffic sources</h3>
            <Link href="/m/sources" className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700">
              Manage
            </Link>
          </div>
          <MiniBarChart items={trafficBars} color="#0EA5E9" />
        </div>

        <div className="lg:col-span-4 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-neutral-900 text-sm">Recent customers</h3>
            <Link href="/m/customers" className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700">
              View all
            </Link>
          </div>
          {customers.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">No customers yet.</p>
          ) : (
            <div className="space-y-3">
              {customers.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="size-8 rounded-xl bg-neutral-100 flex items-center justify-center text-[10px] font-black text-neutral-700 shrink-0">
                    {(c.name || "CU").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-neutral-900 truncate">{c.name || "Customer"}</p>
                    <p className="text-[10px] text-neutral-400 font-semibold">{c.phone}</p>
                  </div>
                  <span className="text-[9px] font-bold text-neutral-400">{timeAgo(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-neutral-900 text-sm">Reward inventory</h3>
            <Link href="/m/rewards" className="text-[10px] font-bold text-neutral-400 hover:text-neutral-600">
              View all
            </Link>
          </div>
          {prizes.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">No prizes configured.</p>
          ) : (
            <div className="space-y-3">
              {prizes.slice(0, 4).map((p) => {
                const remaining = Math.max(p.total_quantity - p.won_count, 0);
                const pct = Math.round((p.won_count / Math.max(p.total_quantity, 1)) * 100);
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-bold text-neutral-800 truncate pr-2">{p.name}</span>
                      <span className="font-black text-neutral-900 shrink-0">{remaining} left</span>
                    </div>
                    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${100 - pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-black text-neutral-900 text-sm">Recent activity</h3>
            <Link href="/m/activity" className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-neutral-400">No activity yet.</p>
          ) : (
            <div className="relative border-l border-neutral-100 pl-4 ml-2 space-y-5">
              {recent.slice(0, 6).map((e) => {
                const m = eventMeta(e.event_type);
                const Icon = m.icon;
                return (
                  <div key={e.id} className="relative">
                    <div className={`absolute -left-[22px] top-0.5 size-5 rounded-full flex items-center justify-center ${m.tone}`}>
                      <Icon className="size-3" />
                    </div>
                    <p className="text-xs font-bold text-neutral-900">
                      {m.label}
                      {e.campaign_name && (
                        <span className="font-medium text-neutral-500"> · {e.campaign_name}</span>
                      )}
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      {ACTOR_LABEL[e.actor_type] ?? e.actor_type} · {timeAgo(e.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-neutral-900 text-sm">Quick actions</h3>
            <div className="grid grid-cols-3 gap-2">
              <QuickAction label="New campaign" icon={Plus} href="/m/campaigns/new" />
              <QuickAction
                label="Print QR"
                icon={Printer}
                href={
                  activeCampaign && merchantSlug
                    ? `/m/campaigns/print/${merchantSlug}/${activeCampaign.slug}`
                    : "/m/campaigns"
                }
              />
              <QuickAction label="WATI" icon={Send} href="/m/wati" />
              <QuickAction label="Customers" icon={Users} href="/m/customers" />
              <QuickAction label="Rewards" icon={Gift} href="/m/rewards" />
              <QuickAction label="Analytics" icon={FileText} href="/m/analytics" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-6 space-y-3 shadow-lg shadow-emerald-500/15 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 size-24 bg-white/10 rounded-full" />
            <div className="flex items-center gap-2 relative">
              <Sparkles className="size-4 text-emerald-200" />
              <h3 className="font-black text-sm">Today&apos;s focus</h3>
            </div>
            <ul className="space-y-2 text-xs font-medium text-emerald-50 relative">
              <li>· {campaigns.reduce((s, c) => s + c.remaining_coupons, 0)} coupons remaining across campaigns</li>
              <li>· {customersToday} customers joined today</li>
              <li>· Best WhatsApp window: 5–7 PM IST</li>
            </ul>
            <Link
              href="/m/marketing"
              className="block w-full text-center py-2.5 bg-white text-emerald-700 rounded-xl text-xs font-black hover:bg-emerald-50 transition relative"
            >
              Send campaign message
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiSparkCard({
  icon: Icon,
  label,
  value,
  sub,
  spark,
  color,
  highlight = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  spark: number[];
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition hover:shadow-md ${
        highlight
          ? "bg-emerald-600 border-emerald-700 text-white shadow-lg shadow-emerald-500/15"
          : "bg-white border-neutral-200/80 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`flex size-9 items-center justify-center rounded-xl ${highlight ? "bg-white/15" : "bg-neutral-50"}`}>
          <Icon className={`size-4 ${highlight ? "text-white" : "text-neutral-600"}`} style={!highlight ? { color } : undefined} />
        </div>
        <SparkLine data={spark} color={highlight ? "#BBF7D0" : color} />
      </div>
      <p className={`text-2xl sm:text-3xl font-black mt-3 tracking-tight ${highlight ? "text-white" : "text-neutral-900"}`}>
        {value.toLocaleString("en-IN")}
      </p>
      <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${highlight ? "text-emerald-100" : "text-neutral-400"}`}>
        {label}
      </p>
      <p className={`text-[10px] font-semibold mt-0.5 ${highlight ? "text-emerald-50/80" : "text-neutral-500"}`}>{sub}</p>
    </div>
  );
}

function CampaignCard({ campaign: c, merchantSlug }: { campaign: DashboardCampaign; merchantSlug: string }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow group">
      <div className="relative h-28 bg-neutral-900 overflow-hidden">
        {c.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.banner_url} alt={c.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-emerald-900/80" />
        )}
        <div className="absolute top-3 right-3">
          <StatusBadge status={c.status} />
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white font-black text-sm truncate drop-shadow">{c.headline || c.name}</p>
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1 gap-3">
        <p className="text-[10px] text-neutral-400 font-semibold">
          {formatDate(c.starts_at)} – {formatDate(c.ends_at)}
        </p>
        <div className="grid grid-cols-3 gap-1.5 bg-neutral-50 rounded-2xl p-2.5">
          <MiniStat label="Scans" val={c.plays} />
          <MiniStat label="Wins" val={c.wins} />
          <MiniStat label="Redeemed" val={c.redeemed} highlight={c.redeemed > 0} />
        </div>
        <div className="mt-auto pt-2 border-t border-neutral-100">
          <DashboardActions campaign={c as any} merchantSlug={merchantSlug} />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-emerald-500 text-white" },
    scheduled: { label: "Scheduled", cls: "bg-blue-500 text-white" },
    paused: { label: "Paused", cls: "bg-amber-500 text-white" },
    draft: { label: "Draft", cls: "bg-neutral-500 text-white" },
    completed: { label: "Ended", cls: "bg-neutral-400 text-white" },
  };
  const cfg = configs[status] ?? configs.draft;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function MiniStat({ label, val, highlight = false }: { label: string; val: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-black ${highlight ? "text-emerald-600" : "text-neutral-900"}`}>{val}</p>
      <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${
        active ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function QuickAction({ label, icon: Icon, href }: { label: string; icon: LucideIcon; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border border-neutral-200/70 hover:border-emerald-300 hover:shadow-sm transition group"
    >
      <div className="size-9 rounded-xl bg-neutral-50 flex items-center justify-center text-neutral-600 group-hover:scale-105 transition-transform">
        <Icon className="size-4" />
      </div>
      <span className="text-[9px] font-bold text-neutral-700 text-center leading-tight">{label}</span>
    </Link>
  );
}

function EmptyCampaigns({ hasCampaigns }: { hasCampaigns: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[240px] bg-white border border-neutral-200/80 rounded-3xl p-8 text-center">
      <Sparkles className="size-10 text-emerald-500 mb-3" />
      <h3 className="font-black text-neutral-900">
        {hasCampaigns ? "No campaigns match your filters" : "No campaigns yet"}
      </h3>
      <p className="text-xs text-neutral-500 mt-1 max-w-sm">
        {hasCampaigns ? "Try clearing the search or status filter." : "Create your first Scratch & Win campaign to get started."}
      </p>
      {!hasCampaigns && (
        <Link href="/m/campaigns/new" className="mt-4 inline-flex items-center gap-2 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
          <Plus className="size-4" /> New Campaign
        </Link>
      )}
    </div>
  );
}
