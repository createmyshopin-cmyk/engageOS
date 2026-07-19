"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { WatiLoadingPanel } from "./overview-tab";
import { fetchWatiConsole } from "./api";
import { WatiError } from "./wati-alerts";

interface AnalyticsPayload {
  ok: boolean;
  events: { queued: number; sent: number; delivered: number; read: number; failed: number };
  quota: { sent: number; limit: number };
  overview: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  } | null;
}

/**
 * WATI Analytics — the delivery funnel measured from EngageOS's own immutable
 * campaign_events log (channel=wati), plus WATI's account-wide broadcast
 * overview when the account exposes it. No estimates.
 */
export function WatiAnalyticsTab() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const json = await fetchWatiConsole("/api/m/wati/analytics");
      if (json.ok) setData(json);
      else setError(String(json.error ?? "Failed to load analytics"));
    } catch {
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (error && !data) {
    return <WatiError onRetry={() => load()}>{error}</WatiError>;
  }
  if (loading || !data) return <WatiLoadingPanel label="Loading WATI analytics…" />;

  const { events, overview } = data;
  const deliveryRate = events.sent > 0 ? Math.round((events.delivered / events.sent) * 100) : 0;
  const readRate = events.delivered > 0 ? Math.round((events.read / events.delivered) * 100) : 0;
  const failRate = events.sent > 0 ? Math.round((events.failed / events.sent) * 100) : 0;

  const funnel = [
    { label: "Queued", value: events.queued, color: "#9CA3AF" },
    { label: "Sent", value: events.sent, color: "#3B82F6" },
    { label: "Delivered", value: events.delivered, color: "#22C55E" },
    { label: "Read", value: events.read, color: "#0EA5E9" },
    { label: "Failed", value: events.failed, color: "#EF4444" },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-bold text-[#3B82F6] hover:bg-[#F8FAFC] disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <WatiError onRetry={() => load(true)} onDismiss={() => setError(null)}>
          {error}
        </WatiError>
      )}

      {/* Rates */}
      <div className="grid grid-cols-3 gap-3">
        <RateCard label="Delivery rate" value={`${deliveryRate}%`} note="delivered / sent" good={deliveryRate >= 85} />
        <RateCard label="Read rate" value={`${readRate}%`} note="read / delivered" good={readRate >= 50} />
        <RateCard label="Failure rate" value={`${failRate}%`} note="failed / sent" good={failRate <= 5} invert />
      </div>

      {/* Funnel bars — real campaign_events counts (channel=wati) */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <h3 className="text-sm font-black text-[#111827]">Message Lifecycle</h3>
        <p className="mt-0.5 text-[10px] font-medium text-[#9CA3AF]">
          Counted from EngageOS’s immutable campaign event log for messages sent through WATI.
        </p>
        <div className="mt-4 space-y-3">
          {funnel.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="w-20 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                {f.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round((f.value / max) * 100)}%`, backgroundColor: f.color }}
                />
              </div>
              <span className="w-16 text-right text-xs font-black text-[#111827]">
                {f.value.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* WATI account-wide broadcast overview (best-effort) */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <h3 className="text-sm font-black text-[#111827]">WATI Broadcast Totals</h3>
        <p className="mt-0.5 text-[10px] font-medium text-[#9CA3AF]">
          Account-wide totals reported by WATI (all broadcasts on this number, not only EngageOS).
        </p>
        {overview ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Total" value={overview.total} />
            <Stat label="Sent" value={overview.sent} />
            <Stat label="Delivered" value={overview.delivered} />
            <Stat label="Read" value={overview.read} />
            <Stat label="Failed" value={overview.failed} />
          </div>
        ) : (
          <p className="mt-3 text-xs font-medium text-[#6B7280]">
            WATI didn’t return account-wide totals for this plan — the lifecycle funnel above is your
            source of truth.
          </p>
        )}
      </div>
    </div>
  );
}

function RateCard({
  label,
  value,
  note,
  good,
  invert = false,
}: {
  label: string;
  value: string;
  note: string;
  good: boolean;
  invert?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-center">
      <p className={`text-2xl font-black ${good ? "text-[#16A34A]" : invert ? "text-[#B91C1C]" : "text-[#B45309]"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{label}</p>
      <p className="text-[9px] font-medium text-[#9CA3AF]">{note}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 text-center">
      <p className="text-lg font-black leading-none text-[#111827]">
        {value.toLocaleString("en-IN")}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">{label}</p>
    </div>
  );
}
