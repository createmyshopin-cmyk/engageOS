"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { commFetch } from "./api";

interface Analytics {
  funnel: Record<string, number>;
  broadcasts: { sent: number; delivered: number; read: number; failed: number };
  quota: { sent: number; limit: number };
}

export function ReportsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<Analytics>("/api/m/communication/analytics");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading reports…
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? "No data"}</p>;
  }

  const cards = [
    { label: "Queued", value: data.funnel["whatsapp.queue"] ?? 0 },
    { label: "Sent", value: data.funnel["whatsapp.sent"] ?? 0 },
    { label: "Delivered", value: data.funnel["whatsapp.delivered"] ?? 0 },
    { label: "Read", value: data.funnel["whatsapp.read"] ?? 0 },
    { label: "Failed", value: data.funnel["whatsapp.failed"] ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs text-[#6B7280] font-bold uppercase">{c.label}</p>
            <p className="text-2xl font-black text-[#111827] mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="text-sm font-bold text-[#111827]">Broadcast totals</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Sent</dt><dd>{data.broadcasts.sent}</dd></div>
            <div className="flex justify-between"><dt>Delivered</dt><dd>{data.broadcasts.delivered}</dd></div>
            <div className="flex justify-between"><dt>Read</dt><dd>{data.broadcasts.read}</dd></div>
            <div className="flex justify-between"><dt>Failed</dt><dd>{data.broadcasts.failed}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="text-sm font-bold text-[#111827]">Message quota</h3>
          <p className="mt-3 text-2xl font-black text-[#111827]">
            {data.quota.sent} <span className="text-sm font-medium text-[#6B7280]">/ {data.quota.limit}</span>
          </p>
          <p className="text-xs text-[#6B7280] mt-2">WhatsApp messages sent this billing period</p>
        </div>
      </div>
    </div>
  );
}
