"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Eye,
  Send,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Ticket,
  Workflow,
} from "lucide-react";
import { fetchWatiConsole } from "./api";

interface StatusPayload {
  ok: boolean;
  connected: boolean;
  integration: {
    baseUrl: string;
    displayName: string | null;
    channelName: string | null;
    status: string;
    lastError: string | null;
    couponTemplateName: string | null;
    autoSendCoupons: boolean;
    participationTemplateName: string | null;
    autoSendParticipation: boolean;
  } | null;
}

interface AnalyticsPayload {
  ok: boolean;
  events: { queued: number; sent: number; delivered: number; read: number; failed: number };
  quota: { sent: number; limit: number };
}

export function WatiOverviewTab({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        fetchWatiConsole("/api/m/integrations/wati"),
        fetchWatiConsole("/api/m/wati/analytics"),
      ]);
      if (!s.ok) throw new Error(s.error ?? "Failed to load status");
      if (!a.ok) throw new Error(a.error ?? "Failed to load analytics");
      setStatus(s);
      setAnalytics(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 text-xs font-bold text-[#B91C1C]">
        {error}
      </div>
    );
  }
  if (!status || !analytics) {
    return <WatiLoadingPanel label="Loading WATI overview…" />;
  }

  const integ = status.integration;
  const connected = integ?.status === "connected";
  const quotaUsedPct =
    analytics.quota.limit > 0
      ? Math.min(100, Math.round((analytics.quota.sent / analytics.quota.limit) * 100))
      : 0;

  const FUNNEL = [
    { label: "Queued", value: analytics.events.queued, icon: Clock, color: "#6B7280" },
    { label: "Sent", value: analytics.events.sent, icon: Send, color: "#3B82F6" },
    { label: "Delivered", value: analytics.events.delivered, icon: CheckCircle2, color: "#22C55E" },
    { label: "Read", value: analytics.events.read, icon: Eye, color: "#0EA5E9" },
    { label: "Failed", value: analytics.events.failed, icon: XCircle, color: "#EF4444" },
  ];

  return (
    <div className="space-y-5">
      {/* Connection banner */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 ${
          connected ? "border-[#3B82F6]/25 bg-[#EFF6FF]" : "border-[#FCD34D] bg-[#FFFBEB]"
        }`}
      >
        <span
          className={`size-2 rounded-full ${
            connected ? "bg-[#3B82F6] animate-pulse" : "bg-[#F59E0B]"
          }`}
        />
        <p className="text-xs font-bold text-[#111827]">
          {connected
            ? `Connected to WATI “${integ?.displayName ?? integ?.channelName ?? "WhatsApp"}”`
            : `Connection needs attention${integ?.lastError ? `: ${integ.lastError}` : ""}`}
        </p>
        <span className="ml-auto text-[10px] font-bold text-[#6B7280] truncate">
          {integ?.baseUrl}
        </span>
      </div>

      {/* Delivery funnel — real campaign_events counts, channel=wati */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {FUNNEL.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-[#E5E7EB] bg-white py-4 text-center">
            <Icon className="mx-auto mb-1.5 size-4" style={{ color }} />
            <p className="text-xl font-black leading-none text-[#111827]">
              {value.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Auto-send status */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#111827]">Automated Delivery</h3>
            <button
              onClick={() => onGoTo("automation")}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] hover:text-[#2563EB]"
            >
              <Workflow className="size-3" /> Manage
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            <AutoRow
              label="Coupon on win"
              on={!!integ?.autoSendCoupons}
              template={integ?.couponTemplateName ?? null}
            />
            <AutoRow
              label="Participation on play"
              on={!!integ?.autoSendParticipation}
              template={integ?.participationTemplateName ?? null}
            />
          </div>
          {!integ?.couponTemplateName && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-[#B45309]">
              <AlertTriangle className="size-3.5" />
              No coupon template set — configure one in Coupon Delivery.
            </p>
          )}
          <button
            onClick={() => onGoTo("coupons")}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] hover:text-[#2563EB]"
          >
            <Ticket className="size-3" /> Configure coupon delivery →
          </button>
        </div>

        {/* Quota */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#111827]">Monthly Quota</h3>
            <button
              onClick={load}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] hover:text-[#2563EB]"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <p className="mt-3 text-2xl font-black text-[#111827]">
            {analytics.quota.sent.toLocaleString("en-IN")}
            <span className="text-sm font-bold text-[#9CA3AF]">
              {" "}
              / {analytics.quota.limit.toLocaleString("en-IN")}
            </span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
            <div
              className={`h-full rounded-full transition-all ${
                quotaUsedPct > 80 ? "bg-[#F59E0B]" : "bg-[#3B82F6]"
              }`}
              style={{ width: `${quotaUsedPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-[#9CA3AF]">
            Counted per message EngageOS sends through WATI (coupon + participation).
          </p>
          <button
            onClick={() => onGoTo("analytics")}
            className="mt-3 text-[11px] font-bold text-[#3B82F6] hover:text-[#2563EB]"
          >
            View full analytics →
          </button>
        </div>
      </div>
    </div>
  );
}

function AutoRow({
  label,
  on,
  template,
}: {
  label: string;
  on: boolean;
  template: string | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#111827]">{label}</p>
        <p className="text-[10px] font-medium text-[#9CA3AF] truncate">
          {template ? `Template: ${template}` : "No template set"}
        </p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
          on ? "bg-[#DBEAFE] text-[#2563EB]" : "bg-[#F3F4F6] text-[#9CA3AF]"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </div>
  );
}

export function WatiLoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white py-14 text-xs font-bold text-[#6B7280]">
      <Loader2 className="size-4 animate-spin text-[#3B82F6]" />
      {label}
    </div>
  );
}
