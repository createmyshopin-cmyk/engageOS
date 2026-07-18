"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { PROVIDER_META_LIST } from "@/lib/tracking/provider-meta";
import { isValidProviderId } from "@/lib/tracking/validation";
import type { ProviderKey } from "@/lib/tracking/types";

interface OverrideRow {
  provider: ProviderKey;
  enabled: boolean;
  provider_id: string | null;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login";
    return new Promise(() => {});
  }
  return res.json();
}

/**
 * Campaign-level tracking override. "Use business defaults" (the default) means
 * the campaign inherits whatever providers the business enabled. Turning it off
 * switches to campaign-specific tracking: only the providers toggled on here
 * (with their own IDs) fire for this campaign.
 */
export function CampaignTrackingForm({ campaignId }: { campaignId: string }) {
  const endpoint = `/api/m/campaigns/${campaignId}/tracking`;
  const [loaded, setLoaded] = useState(false);
  const [useDefault, setUseDefault] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; id: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await apiFetch(endpoint);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      setUseDefault(json.useDefault as boolean);
      const rows = (json.overrides as OverrideRow[]) ?? [];
      const draft: Record<string, { enabled: boolean; id: string }> = {};
      for (const meta of PROVIDER_META_LIST) {
        const row = rows.find((r) => r.provider === meta.key);
        draft[meta.key] = {
          enabled: row?.enabled ?? false,
          id: row?.provider_id ?? "",
        };
      }
      setDrafts(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, [endpoint]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const overrides = PROVIDER_META_LIST.map((meta) => ({
      provider: meta.key,
      enabled: drafts[meta.key]?.enabled ?? false,
      providerId: drafts[meta.key]?.id.trim() || null,
    }));
    try {
      const json = await apiFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useDefault, overrides: useDefault ? undefined : overrides }),
      });
      if (!json.ok) {
        setError((json.error as string) ?? "Failed to save");
      } else {
        setNotice("Saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 text-xs font-bold text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading tracking…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Radar className="size-4 text-[#4F46E5]" />
        <h3 className="text-sm font-black text-[#111827]">Campaign Tracking</h3>
      </div>

      {notice && (
        <div className="rounded-2xl border border-[#16A34A]/25 bg-[#F0FDF4] p-3 text-xs font-bold text-[#15803D]">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs font-bold text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Mode selector */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setUseDefault(true)}
          className={`rounded-2xl border p-4 text-left transition-colors ${
            useDefault
              ? "border-[#4F46E5] bg-[#EEF2FF]"
              : "border-[#E5E7EB] bg-white hover:bg-neutral-50"
          }`}
        >
          <span className="block text-xs font-black text-[#111827]">Use business defaults</span>
          <span className="mt-1 block text-[11px] font-medium text-[#6B7280]">
            Inherit every provider enabled at the business level.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setUseDefault(false)}
          className={`rounded-2xl border p-4 text-left transition-colors ${
            !useDefault
              ? "border-[#4F46E5] bg-[#EEF2FF]"
              : "border-[#E5E7EB] bg-white hover:bg-neutral-50"
          }`}
        >
          <span className="block text-xs font-black text-[#111827]">Campaign specific tracking</span>
          <span className="mt-1 block text-[11px] font-medium text-[#6B7280]">
            Fire only the providers you choose below for this campaign.
          </span>
        </button>
      </div>

      {/* Per-provider override rows */}
      {!useDefault && (
        <div className="space-y-2">
          {PROVIDER_META_LIST.map((meta) => {
            const d = drafts[meta.key] ?? { enabled: false, id: "" };
            const idValid = d.id.trim() === "" || isValidProviderId(meta.key, d.id.trim());
            return (
              <div
                key={meta.key}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3"
              >
                <label className="flex items-center gap-2 min-w-[140px]">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) =>
                      setDrafts((p) => ({
                        ...p,
                        [meta.key]: { ...d, enabled: e.target.checked },
                      }))
                    }
                    className="size-4 accent-[#4F46E5]"
                  />
                  <span className="text-xs font-bold text-[#111827]">{meta.label}</span>
                </label>
                <div className="flex-1 min-w-[180px]">
                  <input
                    value={d.id}
                    disabled={!d.enabled}
                    onChange={(e) =>
                      setDrafts((p) => ({
                        ...p,
                        [meta.key]: { ...d, id: e.target.value },
                      }))
                    }
                    placeholder={meta.placeholder}
                    className={`w-full rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400 ${
                      idValid ? "border-[#E5E7EB] focus:border-[#3B82F6]" : "border-[#FCA5A5]"
                    }`}
                  />
                  {!idValid && (
                    <p className="mt-1 text-[10px] font-bold text-[#B91C1C]">
                      Expected: {meta.format}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA] disabled:opacity-50"
      >
        {saving && <Loader2 className="size-3.5 animate-spin" />}
        Save tracking
      </button>
    </div>
  );
}
