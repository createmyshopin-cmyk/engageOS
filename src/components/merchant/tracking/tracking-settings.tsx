"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Zap, ExternalLink } from "lucide-react";
import { PROVIDER_META_LIST } from "@/lib/tracking/provider-meta";
import { isValidProviderId } from "@/lib/tracking/validation";
import { createProvider } from "@/lib/tracking/registry";
import type { ProviderKey, TrackingContext } from "@/lib/tracking/types";

const ENDPOINT = "/api/m/integrations/tracking";

interface Row {
  provider: ProviderKey;
  enabled: boolean;
  provider_id: string | null;
  status: string;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/integrations/tracking";
    return new Promise(() => {});
  }
  return res.json();
}

export function TrackingSettings() {
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await apiFetch(ENDPOINT);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      const list = (json.integrations as Row[]) ?? [];
      const byProvider: Record<string, Row> = {};
      const draft: Record<string, string> = {};
      for (const r of list) {
        byProvider[r.provider] = r;
        draft[r.provider] = r.provider_id ?? "";
      }
      setRows(byProvider);
      setDrafts(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save(provider: ProviderKey, enabled: boolean, providerId: string) {
    setSaving(provider);
    setError(null);
    setNotice(null);
    try {
      const json = await apiFetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled, providerId: providerId.trim() || null }),
      });
      if (!json.ok) {
        setError((json.error as string) ?? "Failed to save");
      } else {
        setRows((prev) => ({
          ...prev,
          [provider]: {
            provider,
            enabled,
            provider_id: providerId.trim() || null,
            status: (json.status as string) ?? "disconnected",
          },
        }));
        setNotice("Saved.");
      }
    } finally {
      setSaving(null);
    }
  }

  function copyId(provider: string, id: string) {
    navigator.clipboard.writeText(id);
    setCopied(provider);
    setTimeout(() => setCopied(null), 1500);
  }

  /**
   * Fire a real sample event through this provider IN THE BROWSER, so the
   * merchant can confirm in their platform's test tools / devtools that the
   * pixel fires. Uses a dummy context — no customer data.
   */
  function testEvent(provider: ProviderKey, id: string) {
    const impl = createProvider(provider);
    if (!impl) return;
    const ctx: TrackingContext = {
      campaignId: "test-campaign",
      campaignName: "EngageOS Test",
      merchantId: "test-merchant",
      merchantName: "EngageOS",
      trafficSource: "test",
      deviceType: "desktop",
    };
    try {
      impl.init({ provider, providerId: id }, ctx);
      impl.track("campaign_viewed", ctx, {});
      impl.track("reward_won", ctx, { rewardName: "Test Reward" });
      setTested(provider);
      setTimeout(() => setTested(null), 2500);
    } catch (err) {
      console.error("test event failed:", err);
      setError("Test event failed — see console.");
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 text-xs font-bold text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading tracking settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDER_META_LIST.map((meta) => {
          const row = rows[meta.key];
          const enabled = row?.enabled ?? false;
          const draft = drafts[meta.key] ?? "";
          const idValid = draft.trim() === "" || isValidProviderId(meta.key, draft.trim());
          const connected = enabled && !!row?.provider_id && row.status === "connected";

          return (
            <div key={meta.key} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap className={`size-4 ${meta.accent}`} />
                    <h3 className="text-sm font-black text-[#111827]">{meta.label}</h3>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-[#9CA3AF]">
                    {meta.idLabel} · {meta.format}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                    connected
                      ? "bg-[#DCFCE7] text-[#16A34A]"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {connected && <span className="size-1.5 rounded-full bg-[#16A34A]" />}
                  {connected ? "Connected" : "Off"}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    {meta.idLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [meta.key]: e.target.value }))
                      }
                      placeholder={meta.placeholder}
                      className={`w-full rounded-xl border bg-white px-3 py-2 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none ${
                        idValid ? "border-[#E5E7EB] focus:border-[#3B82F6]" : "border-[#FCA5A5]"
                      }`}
                    />
                    {draft.trim() && (
                      <button
                        type="button"
                        onClick={() => copyId(meta.key, draft.trim())}
                        title="Copy ID"
                        className="shrink-0 rounded-xl border border-[#E5E7EB] bg-white p-2 text-[#6B7280] hover:bg-neutral-50"
                      >
                        {copied === meta.key ? (
                          <Check className="size-3.5 text-[#16A34A]" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                  {!idValid && (
                    <p className="mt-1 text-[10px] font-bold text-[#B91C1C]">
                      Expected format: {meta.format}
                    </p>
                  )}
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving === meta.key || !idValid}
                    onClick={() => save(meta.key, !enabled, draft)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                      enabled
                        ? "border border-[#FCA5A5] bg-white text-[#B91C1C] hover:bg-[#FEF2F2]"
                        : "bg-[#16A34A] text-white hover:bg-[#15803D]"
                    }`}
                  >
                    {saving === meta.key && <Loader2 className="size-3.5 animate-spin" />}
                    {enabled ? "Disable" : "Enable"}
                  </button>

                  <button
                    type="button"
                    disabled={saving === meta.key || !idValid}
                    onClick={() => save(meta.key, enabled, draft)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[11px] font-bold text-[#111827] hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Save ID
                  </button>

                  <button
                    type="button"
                    disabled={!draft.trim() || !idValid}
                    onClick={() => testEvent(meta.key, draft.trim())}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#3B82F6] bg-white px-3 py-2 text-[11px] font-bold text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-40"
                  >
                    {tested === meta.key ? (
                      <>
                        <Check className="size-3.5" /> Sent
                      </>
                    ) : (
                      "Test Event"
                    )}
                  </button>

                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-[#6B7280] hover:text-[#111827]"
                  >
                    Where to find <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
