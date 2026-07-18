"use client";

/**
 * AnalyticsView — the merchant analytics surface for `/m/analytics`.
 *
 * Two event-sourced aggregates rendered together:
 *   • useAnalyticsOverview()    → KPI snapshot (customers, plays, wins, …)
 *   • useAnalyticsPerformance() → campaign leaderboard + traffic-source breakdown
 *
 * Both flow through the v1 API (React Query, HYBRID data-fetch) — no direct
 * fetch, no DB access, tenancy derived server-side from the session cookie.
 * Each panel owns its own loading / empty / error state so a slow or failing
 * RPC on one never blanks the other.
 */

import {
  Users,
  Gamepad2,
  Trophy,
  Ticket,
  BadgeCheck,
  Repeat,
  BarChart3,
  Radio,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useAnalyticsOverview } from "@/lib/api/hooks/use-dashboard";
import { useAnalyticsPerformance } from "@/lib/api/hooks/use-analytics";
import type {
  AnalyticsOverviewDTO,
  CampaignPerformanceDTO,
  TrafficSourceDTO,
} from "@/lib/api/types";

const nf = new Intl.NumberFormat("en-IN");

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function AnalyticsView() {
  const overview = useAnalyticsOverview();
  const performance = useAnalyticsPerformance();

  const refreshing = overview.isFetching || performance.isFetching;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Analytics</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Engagement, campaign performance and where your traffic comes from.
          </p>
        </div>
        {refreshing && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {/* ── KPI snapshot ── */}
      <section>
        {overview.isLoading ? (
          <KpiSkeleton />
        ) : overview.isError ? (
          <PanelError
            message={
              overview.error instanceof Error ? overview.error.message : "Failed to load KPIs."
            }
            onRetry={overview.refetch}
          />
        ) : (
          <KpiGrid data={overview.data} />
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Campaign leaderboard ── */}
        <section className="lg:col-span-3 bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
          <PanelHeader
            icon={BarChart3}
            title="Campaign performance"
            sub="Ranked by total engagement events"
            tone="bg-blue-50 text-blue-600"
          />
          {performance.isLoading ? (
            <RowsSkeleton />
          ) : performance.isError ? (
            <PanelError
              message={
                performance.error instanceof Error
                  ? performance.error.message
                  : "Failed to load campaigns."
              }
              onRetry={performance.refetch}
            />
          ) : !performance.data || performance.data.campaigns.length === 0 ? (
            <EmptyRow message="No campaign activity yet." />
          ) : (
            <CampaignTable rows={performance.data.campaigns} />
          )}
        </section>

        {/* ── Traffic sources ── */}
        <section className="lg:col-span-2 bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
          <PanelHeader
            icon={Radio}
            title="Traffic sources"
            sub="Scans → registrations → plays"
            tone="bg-violet-50 text-violet-600"
          />
          {performance.isLoading ? (
            <RowsSkeleton />
          ) : performance.isError ? (
            <PanelError
              message={
                performance.error instanceof Error
                  ? performance.error.message
                  : "Failed to load sources."
              }
              onRetry={performance.refetch}
            />
          ) : !performance.data || performance.data.sources.length === 0 ? (
            <EmptyRow message="No traffic recorded yet." />
          ) : (
            <SourceList rows={performance.data.sources} />
          )}
        </section>
      </div>
    </div>
  );
}

// ── KPI grid ──

function KpiGrid({ data }: { data: AnalyticsOverviewDTO | undefined }) {
  const items: { icon: typeof Users; label: string; value: number; tone: string }[] = [
    { icon: Users, label: "Customers", value: data?.customers ?? 0, tone: "bg-blue-50 text-blue-600" },
    { icon: Gamepad2, label: "Plays", value: data?.plays ?? 0, tone: "bg-emerald-50 text-emerald-600" },
    { icon: Trophy, label: "Wins", value: data?.wins ?? 0, tone: "bg-amber-50 text-amber-600" },
    { icon: Ticket, label: "Coupons", value: data?.coupons ?? 0, tone: "bg-violet-50 text-violet-600" },
    { icon: BadgeCheck, label: "Redeemed", value: data?.redeemed ?? 0, tone: "bg-teal-50 text-teal-600" },
    { icon: Repeat, label: "Return visits", value: data?.returnVisits ?? 0, tone: "bg-rose-50 text-rose-600" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-4"
        >
          <div className={`flex items-center justify-center size-9 rounded-xl ${it.tone}`}>
            <it.icon className="size-4.5" />
          </div>
          <p className="text-2xl font-black text-neutral-900 mt-3 tracking-tight">
            {nf.format(it.value)}
          </p>
          <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">{it.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Campaign leaderboard table ──

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  draft: "bg-neutral-100 text-neutral-500",
  archived: "bg-neutral-100 text-neutral-400",
};

function CampaignTable({ rows }: { rows: CampaignPerformanceDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide border-b border-neutral-100">
            <th className="text-left font-bold px-5 py-3">Campaign</th>
            <th className="text-right font-bold px-3 py-3">Scans</th>
            <th className="text-right font-bold px-3 py-3">Regs</th>
            <th className="text-right font-bold px-3 py-3">Redeem</th>
            <th className="text-right font-bold px-5 py-3">Last</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {rows.map((c) => (
            <tr key={c.campaignId} className="hover:bg-neutral-50/60 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-neutral-900 truncate max-w-[180px]">
                    {c.campaignName}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      STATUS_TONE[c.status] ?? "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                {nf.format(c.scans)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                {nf.format(c.registrations)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                {nf.format(c.redemptions)}
              </td>
              <td className="px-5 py-3 text-right text-[11px] font-medium text-neutral-400 tabular-nums">
                {formatDate(c.lastActivity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Traffic source list (share-of-scans bar) ──

function SourceList({ rows }: { rows: TrafficSourceDTO[] }) {
  const max = Math.max(1, ...rows.map((r) => r.qrScans));
  return (
    <ul className="divide-y divide-neutral-50">
      {rows.map((s) => (
        <li key={s.source} className="px-5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-neutral-900 text-sm truncate capitalize">
              {s.source || "Direct"}
            </span>
            <span className="text-[11px] font-semibold text-neutral-500 tabular-nums shrink-0">
              {nf.format(s.qrScans)} scans · {nf.format(s.registrations)} regs
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${(s.qrScans / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Shared panel chrome ──

function PanelHeader({
  icon: Icon,
  title,
  sub,
  tone,
}: {
  icon: typeof BarChart3;
  title: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
      <div className={`flex items-center justify-center size-9 rounded-xl ${tone}`}>
        <Icon className="size-4.5" />
      </div>
      <div>
        <h2 className="text-sm font-black text-neutral-900">{title}</h2>
        <p className="text-[11px] font-medium text-neutral-400">{sub}</p>
      </div>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-14 px-6 text-center">
      <p className="text-xs font-semibold text-neutral-400">{message}</p>
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="size-11 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
        <AlertTriangle className="size-6 text-red-400" />
      </div>
      <p className="text-xs text-neutral-500 max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-neutral-800 transition"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-28 bg-neutral-100 rounded-3xl animate-pulse" />
      ))}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 bg-neutral-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}
