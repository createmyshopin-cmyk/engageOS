"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  EmptyRow,
  PanelError,
  PanelHeader,
  RowsSkeleton,
  UpdatingStrip,
} from "@/components/merchant/analytics/analytics-shared";
import type { AnalyticsPerformanceDTO, CampaignPerformanceDTO } from "@/lib/api/types";

const nf = new Intl.NumberFormat("en-IN");

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  scheduled: "bg-blue-50 text-blue-700",
  draft: "bg-neutral-100 text-neutral-500",
  completed: "bg-neutral-100 text-neutral-400",
  archived: "bg-neutral-100 text-neutral-400",
};

type SortKey = "campaignName" | "scans" | "registrations" | "scratches" | "redemptions" | "redeemRate";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function redeemRate(row: CampaignPerformanceDTO): number {
  return row.scratches > 0 ? (row.redemptions / row.scratches) * 100 : -1;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "right",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`py-3 px-3 font-bold ${align === "left" ? "text-left px-5" : "text-right"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 uppercase tracking-wide text-[11px] ${
          active ? "text-neutral-700" : "text-neutral-400 hover:text-neutral-600"
        }`}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );
}

export function AnalyticsCampaignTable({
  performance,
}: {
  performance: UseQueryResult<AnalyticsPerformanceDTO | undefined, Error>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("scratches");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const list = [...(performance.data?.campaigns ?? [])];
    list.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "campaignName":
          av = a.campaignName.toLowerCase();
          bv = b.campaignName.toLowerCase();
          break;
        case "redeemRate":
          av = redeemRate(a);
          bv = redeemRate(b);
          break;
        default:
          av = a[sortKey];
          bv = b[sortKey];
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [performance.data?.campaigns, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <PanelHeader
        icon={BarChart3}
        title="Campaign performance"
        sub="All-time stats ranked by engagement"
        tone="bg-blue-50 text-blue-600"
      />
      {performance.isFetching && !performance.isLoading && <UpdatingStrip />}
      {performance.isLoading ? (
        <RowsSkeleton />
      ) : performance.isError ? (
        <PanelError
          message={
            performance.error instanceof Error
              ? performance.error.message
              : "Failed to load campaigns."
          }
          onRetry={() => performance.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyRow message="No campaign activity yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <SortHeader
                  label="Campaign"
                  active={sortKey === "campaignName"}
                  dir={sortDir}
                  onClick={() => toggleSort("campaignName")}
                  align="left"
                />
                <SortHeader
                  label="Scans"
                  active={sortKey === "scans"}
                  dir={sortDir}
                  onClick={() => toggleSort("scans")}
                />
                <SortHeader
                  label="Regs"
                  active={sortKey === "registrations"}
                  dir={sortDir}
                  onClick={() => toggleSort("registrations")}
                />
                <SortHeader
                  label="Scratches"
                  active={sortKey === "scratches"}
                  dir={sortDir}
                  onClick={() => toggleSort("scratches")}
                />
                <SortHeader
                  label="Redeem"
                  active={sortKey === "redemptions"}
                  dir={sortDir}
                  onClick={() => toggleSort("redemptions")}
                />
                <SortHeader
                  label="Redeem %"
                  active={sortKey === "redeemRate"}
                  dir={sortDir}
                  onClick={() => toggleSort("redeemRate")}
                />
                <th className="text-right font-bold px-5 py-3 text-[11px] uppercase tracking-wide text-neutral-400">
                  Last
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {rows.map((c) => {
                const rate = redeemRate(c);
                return (
                  <tr key={c.campaignId} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link
                          href={`/m/campaigns/${c.campaignId}`}
                          className="font-bold text-neutral-900 truncate max-w-[200px] hover:text-emerald-700 transition-colors"
                        >
                          {c.campaignName}
                        </Link>
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
                      {nf.format(c.scratches)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                      {nf.format(c.redemptions)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-700 tabular-nums">
                      {rate >= 0 ? `${Math.round(rate)}%` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-[11px] font-medium text-neutral-400 tabular-nums">
                      {formatDate(c.lastActivity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
