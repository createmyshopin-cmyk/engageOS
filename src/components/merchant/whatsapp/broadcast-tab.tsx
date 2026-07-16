"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Megaphone, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { LoadingPanel } from "./overview-tab";
import { fetchAdapter } from "./api";
import type { CampaignOption } from "./whatsapp-tabs";

interface BroadcastRow {
  id: string;
  name: string;
  template_name: string;
  segment: string;
  total_recipients: number;
  accepted: number;
  rejected: number;
  status: string;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
}

/** Broadcast tab — EngageOS segments + wacrm template fan-out. */
export function BroadcastTab({
  campaigns,
  crmUrl,
}: {
  campaigns: CampaignOption[];
  crmUrl: string | null;
}) {
  const [rows, setRows] = useState<BroadcastRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [segment, setSegment] = useState("all");
  const [params, setParams] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/broadcasts");
      if (!json.ok) throw new Error(json.error);
      setRows(json.broadcasts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load broadcasts");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    setLaunching(true);
    setNotice(null);
    setError(null);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          templateName,
          templateLanguage,
          segment,
          params: params
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });
      if (!json.ok) {
        setError(json.error ?? "Failed to launch broadcast");
      } else {
        setNotice(
          `Broadcast launched to ${json.recipients} customers (${json.accepted} accepted, ${json.rejected} rejected). Delivery counts update below.`
        );
        setName("");
        await load();
      }
    } catch {
      setError("Failed to launch broadcast");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Composer */}
      <form onSubmit={launch} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#111827]">
            <Megaphone className="size-4 text-[#16A34A]" />
            New Broadcast
          </h3>
          {crmUrl && (
            <a
              href={crmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-bold text-[#16A34A] hover:text-[#166534]"
            >
              <ExternalLink className="size-3" /> Templates live in wacrm
            </a>
          )}
        </div>
        <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
          Pick a customer segment from your EngageOS campaign data — wacrm fans out the
          Meta-approved template to every recipient.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Broadcast name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali winners follow-up"
              className={inputCls}
            />
          </Field>
          <Field label="Template name (exact, from wacrm)">
            <input
              required
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="promo_offer_v1"
              className={inputCls}
            />
          </Field>
          <Field label="Template language">
            <input
              required
              value={templateLanguage}
              onChange={(e) => setTemplateLanguage(e.target.value)}
              placeholder="en"
              className={inputCls}
            />
          </Field>
          <Field label="Segment">
            <select value={segment} onChange={(e) => setSegment(e.target.value)} className={inputCls}>
              <option value="all">All customers</option>
              <option value="winners">Winners (got a coupon)</option>
              <option value="redeemed">Redeemed a coupon</option>
              {campaigns.map((c) => (
                <option key={c.id} value={`campaign:${c.id}`}>
                  Played: {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template params (comma-separated, {{name}} = customer)">
            <input
              value={params}
              onChange={(e) => setParams(e.target.value)}
              placeholder="{{name}}, 20% OFF"
              className={inputCls}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={launching}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-green-500/20 hover:bg-[#15803D] disabled:opacity-50 transition-colors"
            >
              {launching ? <Loader2 className="size-3.5 animate-spin" /> : <Megaphone className="size-3.5" />}
              Launch broadcast
            </button>
          </div>
        </div>

        {notice && <p className="mt-3 text-[11px] font-bold text-[#15803D]">{notice}</p>}
        {error && <p className="mt-3 text-[11px] font-bold text-[#B91C1C]">{error}</p>}
      </form>

      {/* History */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <h3 className="text-sm font-black text-[#111827]">Broadcast History</h3>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16A34A] hover:text-[#166534]"
          >
            <RefreshCw className="size-3" /> Refresh counts
          </button>
        </div>
        {rows === null ? (
          <LoadingPanel label="Loading broadcasts…" />
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs font-bold text-[#6B7280]">
            No broadcasts yet. Launch your first one above.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                {["Broadcast", "Segment", "Status", "Recipients", "Sent", "Delivered", "Read", "Failed"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-b border-[#F3F4F6] last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-[#111827]">{b.name}</p>
                    <p className="text-[10px] font-medium text-[#9CA3AF]">
                      {b.template_name} · {new Date(b.created_at).toLocaleString("en-IN")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[11px] font-medium text-[#374151]">
                    {b.segment.startsWith("campaign:") ? "Campaign players" : b.segment}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                        b.status === "sent"
                          ? "bg-[#DCFCE7] text-[#16A34A]"
                          : b.status === "sending"
                            ? "bg-[#FEF3C7] text-[#B45309]"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <Num v={b.total_recipients} />
                  <Num v={b.sent_count} />
                  <Num v={b.delivered_count} />
                  <Num v={b.read_count} />
                  <Num v={b.failed_count} danger />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Num({ v, danger = false }: { v: number; danger?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-xs font-black ${danger && v > 0 ? "text-[#B91C1C]" : "text-[#111827]"}`}
    >
      {v.toLocaleString("en-IN")}
    </td>
  );
}
