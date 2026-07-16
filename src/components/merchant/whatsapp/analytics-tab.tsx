"use client";

import React, { useEffect, useState } from "react";
import { LoadingPanel } from "./overview-tab";
import { fetchAdapter } from "./api";

interface AnalyticsPayload {
  events: { queued: number; sent: number; delivered: number; read: number; failed: number };
  coupons: { pending: number; sent: number; failed: number };
  quota: { sent: number; limit: number };
  broadcasts: {
    count: number;
    recipients: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
}

/**
 * Analytics tab — the WhatsApp delivery funnel measured from the immutable
 * campaign_events log (fed live by wacrm's delivery webhooks), plus
 * broadcast aggregates polled from wacrm. No estimates.
 */
export function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdapter("/api/m/whatsapp/analytics")
      .then((json) => (json.ok ? setData(json) : setError(json.error)))
      .catch(() => setError("Failed to load analytics"));
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 text-xs font-bold text-[#B91C1C]">
        {error}
      </div>
    );
  }
  if (!data) return <LoadingPanel label="Loading WhatsApp analytics…" />;

  const { events, broadcasts } = data;
  const deliveryRate = events.sent > 0 ? Math.round((events.delivered / events.sent) * 100) : 0;
  const readRate = events.delivered > 0 ? Math.round((events.read / events.delivered) * 100) : 0;
  const failRate = events.sent > 0 ? Math.round((events.failed / events.sent) * 100) : 0;

  const funnel = [
    { label: "Queued", value: events.queued, color: "#9CA3AF" },
    { label: "Sent", value: events.sent, color: "#16A34A" },
    { label: "Delivered", value: events.delivered, color: "#22C55E" },
    { label: "Read", value: events.read, color: "#0EA5E9" },
    { label: "Failed", value: events.failed, color: "#EF4444" },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="space-y-5">
      {/* Rates */}
      <div className="grid grid-cols-3 gap-3">
        <RateCard label="Delivery rate" value={`${deliveryRate}%`} note="delivered / sent" good={deliveryRate >= 85} />
        <RateCard label="Read rate" value={`${readRate}%`} note="read / delivered" good={readRate >= 50} />
        <RateCard label="Failure rate" value={`${failRate}%`} note="failed / sent" good={failRate <= 5} invert />
      </div>

      {/* Funnel bars — real campaign_events counts */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <h3 className="text-sm font-black text-[#111827]">Message Lifecycle</h3>
        <p className="mt-0.5 text-[10px] font-medium text-[#9CA3AF]">
          Counted from the immutable campaign event log; delivery statuses stream in from
          wacrm webhooks.
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

      {/* Broadcast aggregate */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <h3 className="text-sm font-black text-[#111827]">Broadcast Totals</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="Broadcasts" value={broadcasts.count} />
          <Stat label="Recipients" value={broadcasts.recipients} />
          <Stat label="Sent" value={broadcasts.sent} />
          <Stat label="Delivered" value={broadcasts.delivered} />
          <Stat label="Read" value={broadcasts.read} />
          <Stat label="Failed" value={broadcasts.failed} />
        </div>
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
