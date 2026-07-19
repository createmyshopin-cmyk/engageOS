"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { GoogleSheetsFeedPublic, GoogleSheetsFeedType } from "@/lib/google-sheets/types";

async function fetchSheets(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/integrations/google-sheets";
    return new Promise(() => {});
  }
  return res.json();
}

interface Integration {
  status: string;
  apiKeyPrefix: string;
  spreadsheetUrl: string | null;
  webappUrl: string | null;
  lastSyncAt: string | null;
  connectedAt: string;
}

interface TagOption {
  id: string;
  name: string;
  color: string | null;
}

interface CampaignOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface BuilderState {
  allCustomers: boolean;
  newCustomers: boolean;
  newCustomerDays: 7 | 30 | 90;
  rewardCustomers: boolean;
  campaignsSummary: boolean;
  shopifyCodes: boolean;
  tagIds: string[];
  campaignIds: string[];
}

const ENDPOINT = "/api/m/integrations/google-sheets";
const FEEDS_ENDPOINT = "/api/m/integrations/google-sheets/feeds";
const SCRIPT_ENDPOINT = "/api/m/integrations/google-sheets/script";

const DEFAULT_BUILDER: BuilderState = {
  allCustomers: true,
  newCustomers: true,
  newCustomerDays: 7,
  rewardCustomers: true,
  campaignsSummary: true,
  shopifyCodes: true,
  tagIds: [],
  campaignIds: [],
};

function isGoogleSheetsUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.includes("docs.google.com") && parsed.pathname.includes("/spreadsheets/");
  } catch {
    return false;
  }
}

function isWebappUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.protocol === "https:" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

function normalizeWebappUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function feedsToBuilder(
  feeds: GoogleSheetsFeedPublic[],
  tags: TagOption[],
  campaigns: CampaignOption[]
): BuilderState {
  if (feeds.length === 0) return DEFAULT_BUILDER;

  const builder: BuilderState = {
    allCustomers: false,
    newCustomers: false,
    newCustomerDays: 7,
    rewardCustomers: false,
    campaignsSummary: false,
    shopifyCodes: false,
    tagIds: [],
    campaignIds: [],
  };

  for (const feed of feeds) {
    if (!feed.enabled) continue;
    switch (feed.feedType) {
      case "all_customers":
        builder.allCustomers = true;
        break;
      case "new_customers":
        builder.newCustomers = true;
        builder.newCustomerDays = (feed.config.joinedDays as 7 | 30 | 90) ?? 7;
        break;
      case "reward_customers":
        builder.rewardCustomers = true;
        break;
      case "campaigns_summary":
        builder.campaignsSummary = true;
        break;
      case "shopify_codes":
        builder.shopifyCodes = true;
        break;
      case "tag":
        if (feed.tagId && tags.some((t) => t.id === feed.tagId)) {
          builder.tagIds.push(feed.tagId);
        }
        break;
      case "campaign":
        if (feed.campaignId && campaigns.some((c) => c.id === feed.campaignId)) {
          builder.campaignIds.push(feed.campaignId);
        }
        break;
    }
  }
  return builder;
}

function builderToFeeds(
  builder: BuilderState,
  tags: TagOption[],
  campaigns: CampaignOption[]
): Array<{
  feedType: GoogleSheetsFeedType;
  tabName: string;
  campaignId?: string | null;
  tagId?: string | null;
  config?: { joinedDays?: number };
  enabled: boolean;
}> {
  const feeds: Array<{
    feedType: GoogleSheetsFeedType;
    tabName: string;
    campaignId?: string | null;
    tagId?: string | null;
    config?: { joinedDays?: number };
    enabled: boolean;
  }> = [];

  if (builder.allCustomers) {
    feeds.push({ feedType: "all_customers", tabName: "Customers", enabled: true });
  }
  if (builder.newCustomers) {
    feeds.push({
      feedType: "new_customers",
      tabName: `New Customers ${builder.newCustomerDays}d`,
      config: { joinedDays: builder.newCustomerDays },
      enabled: true,
    });
  }
  if (builder.rewardCustomers) {
    feeds.push({ feedType: "reward_customers", tabName: "Reward Customers", enabled: true });
  }
  if (builder.campaignsSummary) {
    feeds.push({ feedType: "campaigns_summary", tabName: "Campaigns", enabled: true });
  }
  if (builder.shopifyCodes) {
    feeds.push({ feedType: "shopify_codes", tabName: "Shopify Codes", enabled: true });
  }
  for (const tagId of builder.tagIds) {
    const tag = tags.find((t) => t.id === tagId);
    if (tag) feeds.push({ feedType: "tag", tabName: tag.name, tagId: tag.id, enabled: true });
  }
  for (const campaignId of builder.campaignIds) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (campaign) {
      feeds.push({
        feedType: "campaign",
        tabName: campaign.name.slice(0, 100),
        campaignId: campaign.id,
        enabled: true,
      });
    }
  }
  return feeds;
}

export function GoogleSheetsSettings() {
  const [loaded, setLoaded] = useState(false);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [builder, setBuilder] = useState<BuilderState>(DEFAULT_BUILDER);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingFeeds, setSavingFeeds] = useState(false);
  const [savingUrls, setSavingUrls] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState("");
  const [apiKeyOnce, setApiKeyOnce] = useState<string | null>(null);
  const [scriptBody, setScriptBody] = useState<string | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [copyingScript, setCopyingScript] = useState(false);
  const [appUrl, setAppUrl] = useState("");

  const load = useCallback(async () => {
    try {
      const json = await fetchSheets(ENDPOINT);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      const integ = (json.integration as Integration | null) ?? null;
      const tagList = (json.tags as TagOption[]) ?? [];
      const campaignList = (json.campaigns as CampaignOption[]) ?? [];
      const feedList = (json.feeds as GoogleSheetsFeedPublic[]) ?? [];
      setIntegration(integ);
      setTags(tagList);
      setCampaigns(campaignList);
      setSpreadsheetUrl(integ?.spreadsheetUrl ?? "");
      setAppUrl(
        integ?.webappUrl ??
          (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "")
      );
      setBuilder(feedsToBuilder(feedList, tagList, campaignList));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoaded(true);
    }
  }, []);

  const loadScript = useCallback(async () => {
    setLoadingScript(true);
    try {
      const json = await fetchSheets(SCRIPT_ENDPOINT);
      if (json.ok) setScriptBody((json.script as string) ?? null);
    } catch {
      setScriptBody(null);
    } finally {
      setLoadingScript(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const connected = !!integration && integration.status === "connected";

  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => loadScript(), 300);
    return () => clearTimeout(t);
  }, [connected, builder, loadScript]);

  const previewTabs = useMemo(
    () => builderToFeeds(builder, tags, campaigns).map((f) => f.tabName),
    [builder, tags, campaigns]
  );

  async function connect(regenerate = false) {
    const url = spreadsheetUrl.trim();
    const webapp = normalizeWebappUrl(appUrl);
    if (!isGoogleSheetsUrl(url)) {
      setError("Enter a valid Google Sheets URL");
      return;
    }
    if (!isWebappUrl(webapp)) {
      setError("Enter a valid EngageOS web app URL (https://your-domain.com)");
      return;
    }
    if (regenerate) setRegenerating(true);
    else setConnecting(true);
    setError(null);
    setNotice(null);
    if (!regenerate) setApiKeyOnce(null);
    try {
      const json = await fetchSheets(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetUrl: url, webappUrl: webapp, regenerate }),
      });
      if (!json.ok) setError((json.error as string) ?? "Failed to connect");
      else {
        setApiKeyOnce((json.apiKey as string) ?? null);
        setNotice(regenerate ? "API key regenerated." : "Connected. Configure exports below.");
        await load();
      }
    } finally {
      setConnecting(false);
      setRegenerating(false);
    }
  }

  async function saveUrls() {
    const url = spreadsheetUrl.trim();
    const webapp = normalizeWebappUrl(appUrl);
    if (!isGoogleSheetsUrl(url)) {
      setError("Enter a valid Google Sheets URL");
      return;
    }
    if (!isWebappUrl(webapp)) {
      setError("Enter a valid EngageOS web app URL");
      return;
    }
    setSavingUrls(true);
    setError(null);
    try {
      const json = await fetchSheets(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetUrl: url, webappUrl: webapp }),
      });
      if (!json.ok) setError((json.error as string) ?? "Failed to save URLs");
      else {
        setNotice("Connection URLs saved. Copy the updated Apps Script if your web app URL changed.");
        await load();
        await loadScript();
      }
    } finally {
      setSavingUrls(false);
    }
  }

  async function saveFeeds() {
    setSavingFeeds(true);
    setError(null);
    try {
      const feeds = builderToFeeds(builder, tags, campaigns);
      const json = await fetchSheets(FEEDS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeds }),
      });
      if (!json.ok) setError((json.error as string) ?? "Failed to save");
      else {
        setNotice(`Export config saved — ${feeds.length} tab(s) will sync.`);
        await loadScript();
      }
    } finally {
      setSavingFeeds(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Sheets?")) return;
    setDisconnecting(true);
    try {
      const json = await fetchSheets(ENDPOINT, { method: "DELETE" });
      if (!json.ok) setError((json.error as string) ?? "Failed to disconnect");
      else {
        setIntegration(null);
        setApiKeyOnce(null);
        setScriptBody(null);
        setNotice("Disconnected.");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const res = await fetch("/api/v1/integrations/google-sheets/export?feed=all_customers&limit=1");
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "Test failed");
      setNotice("API connection OK.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setNotice(`${label} copied.`);
  }

  function toggleTag(tagId: string) {
    setBuilder((b) => ({
      ...b,
      tagIds: b.tagIds.includes(tagId)
        ? b.tagIds.filter((id) => id !== tagId)
        : [...b.tagIds, tagId],
    }));
  }

  function toggleCampaign(campaignId: string) {
    setBuilder((b) => ({
      ...b,
      campaignIds: b.campaignIds.includes(campaignId)
        ? b.campaignIds.filter((id) => id !== campaignId)
        : [...b.campaignIds, campaignId],
    }));
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  const linkedSheetUrl = integration?.spreadsheetUrl ?? (spreadsheetUrl.trim() || null);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-[#BBF7D0] bg-[#DCFCE7] px-4 py-3 text-xs font-medium text-[#15803D]">{notice}</div>
      )}

      {/* Connect */}
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#ECFDF5]">
            <Link2 className="size-5 text-[#059669]" />
          </div>
          <div>
            <h2 className="text-sm font-black text-[#111827]">Connect EngageOS to your Google Sheet</h2>
            <p className="text-xs text-[#6B7280] font-medium">
              Both URLs are required — your EngageOS app and spreadsheet link together via Apps Script.
            </p>
          </div>
          {connected && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-1 text-[10px] font-black text-[#16A34A]">
              <ShieldCheck className="size-3" /> Connected
            </span>
          )}
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-[#6B7280]">
              EngageOS web app URL
            </span>
            <input
              type="url"
              value={appUrl}
              onChange={(e) => setAppUrl(e.target.value)}
              placeholder="https://app.engageos.com"
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-xs font-medium"
            />
            <span className="text-[10px] text-[#9CA3AF]">
              Production URL where Apps Script calls your EngageOS API (no trailing slash).
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-[#6B7280]">
              Google Sheet URL
            </span>
            <input
              type="url"
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-xs font-medium"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={() => connect(false)}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {connecting ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              Connect via Apps Script
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={saveUrls}
                disabled={savingUrls}
                className="inline-flex items-center gap-1 rounded-xl border border-[#16A34A] px-3 py-2 text-xs font-bold text-[#16A34A]"
              >
                {savingUrls ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save URLs
              </button>
              {linkedSheetUrl && (
                <a href={linkedSheetUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold">
                  Open sheet <ExternalLink className="size-3.5" />
                </a>
              )}
              <button type="button" onClick={() => connect(true)} disabled={regenerating}
                className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold">
                <RefreshCw className="size-3.5" /> Regenerate key
              </button>
              <button type="button" onClick={testConnection} disabled={testing}
                className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold">
                <CheckCircle2 className="size-3.5" /> Test API
              </button>
              <button type="button" onClick={disconnect} disabled={disconnecting}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">
                <Trash2 className="size-3.5" /> Disconnect
              </button>
            </>
          )}
        </div>
      </section>

      {apiKeyOnce && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 space-y-3">
          <p className="text-xs font-black text-amber-900 uppercase">Copy API key now</p>
          <code className="block break-all rounded-xl bg-white border p-3 text-xs font-mono">{apiKeyOnce}</code>
          <button type="button" onClick={() => copyText(apiKeyOnce, "API key")}
            className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white">
            <Copy className="size-3.5" /> Copy
          </button>
        </section>
      )}

      {/* Export builder */}
      {connected && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-sm font-black text-[#111827]">Export builder</h2>
            <p className="text-xs text-[#6B7280] font-medium mt-1">
              Choose what syncs — each option becomes its own tab. Save to regenerate Apps Script.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "allCustomers" as const, label: "All Customers" },
              { key: "rewardCustomers" as const, label: "Reward Customers" },
              { key: "campaignsSummary" as const, label: "Campaigns Summary" },
              { key: "shopifyCodes" as const, label: "Shopify Codes" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={builder[key]}
                  onChange={(e) => setBuilder((b) => ({ ...b, [key]: e.target.checked }))}
                  className="rounded"
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer sm:col-span-2">
              <input
                type="checkbox"
                checked={builder.newCustomers}
                onChange={(e) => setBuilder((b) => ({ ...b, newCustomers: e.target.checked }))}
                className="rounded"
              />
              New Customers
              <select
                value={builder.newCustomerDays}
                onChange={(e) =>
                  setBuilder((b) => ({
                    ...b,
                    newCustomerDays: Number(e.target.value) as 7 | 30 | 90,
                  }))
                }
                className="ml-auto rounded border px-2 py-0.5 text-[10px]"
                disabled={!builder.newCustomers}
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
          </div>

          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-[#6B7280]">Tags (one tab each)</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold border ${
                      builder.tagIds.includes(tag.id)
                        ? "bg-[#16A34A] text-white border-[#16A34A]"
                        : "bg-white text-[#374151] border-[#E5E7EB]"
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {campaigns.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase text-[#6B7280]">Campaigns (one tab each)</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {campaigns.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={builder.campaignIds.includes(c.id)}
                      onChange={() => toggleCampaign(c.id)}
                    />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[#9CA3AF] text-[10px]">{c.status}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-neutral-50 border px-3 py-2 text-[10px] text-[#6B7280]">
            <strong>{previewTabs.length}</strong> tab(s): {previewTabs.join(", ") || "none selected"}
          </div>

          <button
            type="button"
            onClick={saveFeeds}
            disabled={savingFeeds || previewTabs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {savingFeeds ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save export config
          </button>
        </section>
      )}

      {/* Script */}
      {connected && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FileCode2 className="size-4 text-[#4F46E5]" />
              <h2 className="text-sm font-black">Auto-generated Apps Script</h2>
            </div>
            <button
              type="button"
              onClick={() => scriptBody && copyText(scriptBody, "Apps Script")}
              disabled={!scriptBody || copyingScript}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <Copy className="size-3.5" /> Copy script
            </button>
          </div>
          <p className="text-xs text-[#6B7280]">
            Paste into <strong>Extensions → Apps Script</strong>, set <code className="font-mono bg-neutral-100 px-1">ENGAGEOS_API_KEY</code> in Script Properties, run <code className="font-mono bg-neutral-100 px-1">setupEngageOS()</code>. Your web app URL is embedded in the script.
          </p>
          <div className="rounded-xl border bg-[#0F172A] overflow-hidden">
            <div className="px-3 py-2 border-b border-[#1E293B] bg-[#1E293B] text-[10px] font-mono text-[#94A3B8]">
              engageos-sync.gs {loadingScript && "(updating…)"}
            </div>
            <pre className="max-h-[420px] overflow-auto p-4 text-[11px] font-mono text-[#E2E8F0] whitespace-pre">
              {scriptBody ?? "Save export config to generate script…"}
            </pre>
          </div>
        </section>
      )}


      <section className="rounded-2xl border bg-[#F9FAFB] p-6">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="size-4 text-[#059669]" />
          <h2 className="text-sm font-black">What syncs</h2>
        </div>
        <ul className="text-xs text-[#6B7280] space-y-1">
          <li><strong>Customers / New / Reward</strong> — campaign participant data with coupons</li>
          <li><strong>Tags</strong> — customers per tag tab</li>
          <li><strong>Campaigns</strong> — summary tab + per-campaign player tabs</li>
          <li><strong>Shopify Codes</strong> — all issued codes with Shopify link status</li>
        </ul>
      </section>
    </div>
  );
}


