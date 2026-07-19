"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Check,
  ExternalLink,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { fetchWatiConsole } from "./api";
import { WatiLoadingPanel } from "./overview-tab";
import { WatiError } from "./wati-alerts";

interface WatiTemplate {
  id: string;
  name: string;
  status: string;
  language: string | null;
  category: string | null;
}

/**
 * EngageOS guide templates. WATI API v3 has NO create-template endpoint —
 * templates are authored in the WATI dashboard and approved by Meta. These
 * are copy-paste starter bodies whose variables line up 1:1 with what the
 * EngageOS coupon/participation sender fills in (see src/lib/wati/sync.ts):
 *   {{1}} customer name · {{2}} prize name · {{3}} coupon code
 */
const GUIDE_TEMPLATES = [
  {
    key: "coupon",
    title: "Coupon on win",
    suggestedName: "coupon_delivery_v1",
    category: "MARKETING",
    body:
      "🎉 Congratulations {{1}}! You won *{{2}}*.\n\n" +
      "Here is your coupon code: *{{3}}*\n\n" +
      "Show this message at the store to redeem. Thank you for playing!",
    vars: ["Customer name", "Prize name", "Coupon code"],
  },
  {
    key: "participation",
    title: "Participation (no win)",
    suggestedName: "participation_thank_you",
    category: "MARKETING",
    body:
      "Thanks for playing, {{1}}! 🙌\n\n" +
      "No prize this time, but keep an eye out — new chances to win are coming soon. " +
      "See you again at the store!",
    vars: ["Customer name"],
  },
] as const;

export function WatiTemplatesTab({ baseUrl }: { baseUrl: string | null }) {
  const [templates, setTemplates] = useState<WatiTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchWatiConsole("/api/m/integrations/wati/templates");
      if (json.ok) {
        // Only surface Meta-approved templates — those are the only ones that
        // can actually be sent, so pending/rejected drafts are noise here.
        const approved = ((json.templates as WatiTemplate[]) ?? []).filter(
          (t) => t.status?.toUpperCase() === "APPROVED"
        );
        setTemplates(approved);
      } else setError(json.error ?? "Failed to load templates");
    } catch {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function copyBody(key: string, body: string) {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const matches = baseUrl ? baseUrl.match(/\/(\d+)(?:\/|$)/) : null;
  const watiId = matches ? matches[1] : "";
  const templatesUrl = watiId
    ? `https://live.wati.io/${watiId}/messageTemplate`
    : baseUrl
      ? `${baseUrl.replace(/\/+$/, "")}/templates`
      : null;

  return (
    <div className="space-y-5">
      {/* Guide templates */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#3B82F6]" />
          <h3 className="text-sm font-black text-[#111827]">EngageOS guide templates</h3>
        </div>
        <p className="mt-1 max-w-2xl text-[11px] font-medium leading-relaxed text-[#6B7280]">
          WATI templates are created in your WATI dashboard and approved by Meta — the API can’t
          create them. Copy a starter body below, paste it when creating the template in WATI, and
          keep the <span className="font-bold">{"{{1}} {{2}} {{3}}"}</span> variables in order —
          EngageOS fills them automatically (1 = customer, 2 = prize, 3 = coupon code).
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GUIDE_TEMPLATES.map((g) => (
            <div key={g.key} className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-[#111827]">{g.title}</p>
                <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#2563EB]">
                  {g.category}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-medium text-[#9CA3AF]">
                Suggested name: <span className="font-bold text-[#6B7280]">{g.suggestedName}</span>
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-[#E5E7EB] bg-white p-3 text-[11px] leading-relaxed text-[#374151]">
                {g.body}
              </pre>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {g.vars.map((v, i) => (
                  <span
                    key={v}
                    className="rounded-md bg-[#EFF6FF] px-2 py-0.5 text-[9px] font-bold text-[#2563EB]"
                  >
                    {`{{${i + 1}}}`} = {v}
                  </span>
                ))}
              </div>
              <button
                onClick={() => copyBody(g.key, g.body)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#3B82F6] bg-white px-3 py-2 text-[11px] font-bold text-[#2563EB] hover:bg-[#EFF6FF] transition-colors"
              >
                {copied === g.key ? (
                  <>
                    <Check className="size-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy body
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        {templatesUrl && (
          <a
            href={templatesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#3B82F6]/30 bg-[#EFF6FF] px-4 py-2.5 text-xs font-bold text-[#2563EB] hover:bg-[#DBEAFE] transition-colors"
          >
            <ExternalLink className="size-3.5" />
            Create / manage templates in WATI
          </a>
        )}
      </div>

      {/* Live approved templates */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-[#3B82F6]" />
            <h3 className="text-sm font-black text-[#111827]">Approved WATI templates</h3>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] hover:text-[#2563EB] disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-3">
            <WatiError onRetry={load}>{error}</WatiError>
          </div>
        ) : !templates ? (
          <div className="mt-3">
            <WatiLoadingPanel label="Loading templates from WATI…" />
          </div>
        ) : templates.length === 0 ? (
          <p className="mt-3 text-xs font-medium text-[#6B7280]">
            No approved templates yet. Create one in WATI (use a guide body above), wait for Meta
            approval, then it will appear here.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Language</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {templates.map((t) => (
                  <tr key={t.id} className="text-[#374151]">
                    <td className="px-3 py-2.5 font-bold text-[#111827]">{t.name}</td>
                    <td className="px-3 py-2.5">{t.language ?? "—"}</td>
                    <td className="px-3 py-2.5">{t.category ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                          t.status?.toUpperCase() === "APPROVED"
                            ? "bg-[#DCFCE7] text-[#16A34A]"
                            : "bg-[#FEF3C7] text-[#B45309]"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
