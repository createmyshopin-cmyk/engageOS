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
} from "lucide-react";
import { fetchAdapter } from "./api";

interface StatusPayload {
  connected: boolean;
  integration: {
    accountName: string | null;
    status: string;
    lastError: string | null;
    webhookRegistered: boolean;
    couponTemplateName: string | null;
    autoSendCoupons: boolean;
  } | null;
  quota: { sent: number; limit: number };
  pendingCoupons: number;
}

interface AnalyticsPayload {
  events: { queued: number; sent: number; delivered: number; read: number; failed: number };
  coupons: { pending: number; sent: number; failed: number };
  quota: { sent: number; limit: number };
}

/** Overview tab: live integration health + real delivery funnel + outbox. */
export function OverviewTab({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchNote, setDispatchNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, a] = await Promise.all([
        fetchAdapter("/api/m/whatsapp/status"),
        fetchAdapter("/api/m/whatsapp/analytics"),
      ]);
      if (!s.ok) throw new Error(s.error);
      if (!a.ok) throw new Error(a.error);
      setStatus(s);
      setAnalytics(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function dispatchPending() {
    setDispatching(true);
    setDispatchNote(null);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/dispatch", { method: "POST" });
      if (!json.ok) {
        setDispatchNote(json.error ?? "Dispatch failed");
      } else {
        setDispatchNote(
          `Sent ${json.sent}, failed ${json.failed}, skipped ${json.skipped}.`
        );
        await load();
      }
    } catch {
      setDispatchNote("Dispatch failed. Try again.");
    } finally {
      setDispatching(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 text-xs font-bold text-[#B91C1C]">
        {error}
      </div>
    );
  }
  if (!status || !analytics) {
    return <LoadingPanel label="Loading WhatsApp overview…" />;
  }

  const quotaUsedPct =
    status.quota.limit > 0 ? Math.min(100, Math.round((status.quota.sent / status.quota.limit) * 100)) : 0;

  const FUNNEL = [
    { label: "Queued", value: analytics.events.queued, icon: Clock, color: "#6B7280" },
    { label: "Sent", value: analytics.events.sent, icon: Send, color: "#16A34A" },
    { label: "Delivered", value: analytics.events.delivered, icon: CheckCircle2, color: "#22C55E" },
    { label: "Read", value: analytics.events.read, icon: Eye, color: "#0EA5E9" },
    { label: "Failed", value: analytics.events.failed, icon: XCircle, color: "#EF4444" },
  ];

  return (
    <div className="space-y-5">
      {/* Connection banner */}
      <div
        className={`flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 ${
          status.integration?.status === "connected"
            ? "border-[#16A34A]/25 bg-[#F0FDF4]"
            : "border-[#FCD34D] bg-[#FFFBEB]"
        }`}
      >
        <span
          className={`size-2 rounded-full ${
            status.integration?.status === "connected" ? "bg-[#16A34A] animate-pulse" : "bg-[#F59E0B]"
          }`}
        />
        <p className="text-xs font-bold text-[#111827]">
          {status.integration?.status === "connected"
            ? `Connected to wacrm workspace “${status.integration.accountName ?? "—"}”`
            : `Connection needs attention${status.integration?.lastError ? `: ${status.integration.lastError}` : ""}`}
        </p>
        <span className="ml-auto text-[10px] font-bold text-[#6B7280]">
          {status.integration?.webhookRegistered
            ? "Delivery webhook active"
            : "Delivery webhook not registered (statuses update on refresh only)"}
        </span>
      </div>

      {/* Real delivery funnel from campaign_events */}
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
        {/* Coupon outbox */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#111827]">Coupon Delivery Outbox</h3>
            <button
              onClick={dispatchPending}
              disabled={dispatching || status.pendingCoupons === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-[#15803D] disabled:opacity-40 transition-colors"
            >
              {dispatching ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Send pending
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <OutboxStat label="Pending" value={analytics.coupons.pending} color="#F59E0B" />
            <OutboxStat label="Sent" value={analytics.coupons.sent} color="#16A34A" />
            <OutboxStat label="Failed" value={analytics.coupons.failed} color="#EF4444" />
          </div>
          {dispatchNote && (
            <p className="mt-3 text-[11px] font-bold text-[#374151]">{dispatchNote}</p>
          )}
          {!status.integration?.couponTemplateName && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-[#B45309]">
              <AlertTriangle className="size-3.5" />
              No coupon template set — configure one in Settings to deliver coupons.
            </p>
          )}
        </div>

        {/* Quota */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[#111827]">Monthly Quota</h3>
            <button
              onClick={load}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16A34A] hover:text-[#166534]"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
          <p className="mt-3 text-2xl font-black text-[#111827]">
            {status.quota.sent.toLocaleString("en-IN")}
            <span className="text-sm font-bold text-[#9CA3AF]">
              {" "}
              / {status.quota.limit.toLocaleString("en-IN")}
            </span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
            <div
              className={`h-full rounded-full transition-all ${
                quotaUsedPct > 80 ? "bg-[#F59E0B]" : "bg-[#16A34A]"
              }`}
              style={{ width: `${quotaUsedPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-[#9CA3AF]">
            Counted per message EngageOS sends through wacrm. Broadcasts launched from the
            Broadcast tab are fanned out by wacrm.
          </p>
          <button
            onClick={() => onGoTo("analytics")}
            className="mt-3 text-[11px] font-bold text-[#16A34A] hover:text-[#166534]"
          >
            View full analytics →
          </button>
        </div>
      </div>
    </div>
  );
}

function OutboxStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 text-center">
      <p className="text-lg font-black leading-none" style={{ color }}>
        {value.toLocaleString("en-IN")}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">{label}</p>
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white py-14 text-xs font-bold text-[#6B7280]">
      <Loader2 className="size-4 animate-spin text-[#16A34A]" />
      {label}
    </div>
  );
}
