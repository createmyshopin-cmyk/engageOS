"use client";

/**
 * CustomerDetailDrawer — the Customer 360 panel.
 *
 * Slides in when a customer row is selected. Pulls the 360 bundle
 * (profile + consents + tags + analytics) and the unified timeline
 * (funnel log + universal events, keyset-paginated) via React Query.
 * Reuses `timeAgo` from the campaign timeline helper for relative stamps.
 */

import { useEffect } from "react";
import { X, Phone, Mail, Tag as TagIcon, Loader2, AlertTriangle, Activity } from "lucide-react";
import { useCustomer360, useCustomerTimeline, flattenTimelinePages } from "@/lib/api/hooks/use-customers";
import { timeAgo } from "@/components/merchant/campaign-events-timeline";
import type { TimelineEntryDTO } from "@/lib/api/types";

// The 360 bundle is JSON-typed on the wire; these are the shapes the
// `merchant_customer_360` RPC actually returns (see 0036_cdp_analytics.sql).
interface Bundle {
  profile?: {
    name?: string | null;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    language?: string | null;
    source?: string | null;
    created_at?: string | null;
  } | null;
  consents?: Record<string, string> | null;
  tags?: string[] | null;
  analytics?: {
    total_orders?: number;
    total_spend?: number | string;
    total_plays?: number;
    total_wins?: number;
    total_redemptions?: number;
    rfm_score?: string | null;
    health_score?: number | null;
    clv?: number | string | null;
    last_seen_at?: string | null;
  } | null;
}

function initials(name?: string | null): string {
  if (!name) return "CU";
  return name.trim().slice(0, 2).toUpperCase();
}

const CATEGORY_TONE: Record<string, string> = {
  commerce: "bg-emerald-100 text-emerald-700",
  loyalty: "bg-amber-100 text-amber-700",
  campaign: "bg-blue-100 text-blue-700",
  communication: "bg-violet-100 text-violet-700",
  profile: "bg-neutral-100 text-neutral-700",
  marketing: "bg-pink-100 text-pink-700",
  system: "bg-neutral-100 text-neutral-500",
  ai: "bg-indigo-100 text-indigo-700",
};

export function CustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const { data: bundle, isLoading, isError, error } = useCustomer360(customerId);
  const b = (bundle ?? {}) as Bundle;

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = b.profile?.name || b.profile?.full_name || "Customer";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      {/* Panel */}
      <aside className="relative h-full w-full max-w-md bg-[#F8FAFC] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 bg-white border-b border-neutral-200/80 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center size-11 rounded-2xl bg-[#16A34A] text-white text-sm font-black shrink-0">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-neutral-900 truncate">{name}</h2>
              <p className="text-[11px] text-neutral-400 font-semibold truncate">
                {b.profile?.phone || ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="Close"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {isLoading ? (
            <DrawerSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center text-center py-12">
              <AlertTriangle className="size-8 text-red-400 mb-3" />
              <p className="text-xs font-bold text-neutral-900">Couldn&apos;t load this profile</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
            </div>
          ) : (
            <>
              {/* Contact */}
              <section className="bg-white rounded-2xl border border-neutral-200/80 p-4 space-y-2.5">
                <Row icon={<Phone className="size-3.5" />} label="Phone" value={b.profile?.phone || "—"} />
                <Row icon={<Mail className="size-3.5" />} label="Email" value={b.profile?.email || "—"} />
                {b.profile?.source && (
                  <Row icon={<Activity className="size-3.5" />} label="Source" value={b.profile.source} />
                )}
              </section>

              {/* Analytics KPIs */}
              {b.analytics && <AnalyticsGrid a={b.analytics} />}

              {/* Consents */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Consents</h3>
                <div className="flex flex-wrap gap-2">
                  {b.consents && Object.keys(b.consents).length > 0 ? (
                    Object.entries(b.consents).map(([channel, status]) => (
                      <span
                        key={channel}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          status === "granted"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${status === "granted" ? "bg-emerald-500" : "bg-neutral-400"}`} />
                        {channel}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-neutral-400">No consent records.</span>
                  )}
                </div>
              </section>

              {/* Tags */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {b.tags && b.tags.length > 0 ? (
                    b.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                        <TagIcon className="size-2.5" /> {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-neutral-400">No tags.</span>
                  )}
                </div>
              </section>

              {/* Timeline */}
              <TimelineSection customerId={customerId} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-14">{label}</span>
      <span className="text-xs font-semibold text-neutral-800 truncate flex-1">{value}</span>
    </div>
  );
}

function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function AnalyticsGrid({ a }: { a: NonNullable<Bundle["analytics"]> }) {
  const cells: { label: string; value: string }[] = [
    { label: "Orders", value: String(a.total_orders ?? 0) },
    { label: "Spend", value: money(a.total_spend) },
    { label: "Plays", value: String(a.total_plays ?? 0) },
    { label: "Wins", value: String(a.total_wins ?? 0) },
    { label: "Redemptions", value: String(a.total_redemptions ?? 0) },
    { label: "CLV", value: money(a.clv) },
  ];
  return (
    <section className="grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="bg-white rounded-2xl border border-neutral-200/80 p-3 text-center">
          <p className="text-sm font-black text-neutral-900">{c.value}</p>
          <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-400 mt-0.5">{c.label}</p>
        </div>
      ))}
    </section>
  );
}

function TimelineSection({ customerId }: { customerId: string }) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCustomerTimeline(customerId);
  const entries = flattenTimelinePages(data?.pages);

  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Activity Timeline</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="size-5 rounded-full bg-neutral-100 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 w-40 bg-neutral-100 rounded" />
                <div className="h-2 w-24 bg-neutral-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-[11px] text-neutral-400">Couldn&apos;t load the timeline.</p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-neutral-400">No recorded activity yet.</p>
      ) : (
        <div className="relative border-l border-neutral-200 pl-4 ml-2 space-y-4">
          {entries.map((e: TimelineEntryDTO) => (
            <div key={e.id} className="relative">
              <span
                className={`absolute -left-[22px] top-0.5 size-4 rounded-full flex items-center justify-center ${
                  CATEGORY_TONE[e.category] ?? "bg-neutral-100 text-neutral-500"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
              </span>
              <p className="text-xs font-bold text-neutral-900 leading-tight">{e.name}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5 font-medium capitalize">
                {e.category} · {timeAgo(e.ts)}
              </p>
            </div>
          ))}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="ml-[-4px] text-[11px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isFetchingNextPage && <Loader2 className="size-3 animate-spin" />}
              Load more activity
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-white rounded-2xl border border-neutral-200/80" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-2xl border border-neutral-200/80" />
        ))}
      </div>
      <div className="h-32 bg-white rounded-2xl border border-neutral-200/80" />
    </div>
  );
}
