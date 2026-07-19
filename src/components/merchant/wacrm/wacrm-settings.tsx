"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Link2,
  Loader2,
  Plug,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";

async function fetchWacrm(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/integrations/wacrm";
    return new Promise(() => {});
  }
  return res.json();
}

interface Integration {
  baseUrl: string;
  keyLast4: string;
  accountId: string;
  accountName: string | null;
  status: string;
  lastError: string | null;
  couponTemplateName: string | null;
  couponTemplateLanguage: string;
  autoSendCoupons: boolean;
  lastVerifiedAt: string | null;
  webhookRegistered: boolean;
}

const ENDPOINT = "/api/m/integrations/wacrm";

export function WacrmSettings() {
  const [loaded, setLoaded] = useState(false);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [autoSend, setAutoSend] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await fetchWacrm(ENDPOINT);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      const integ = (json.integration as Integration | null) ?? null;
      setIntegration(integ);
      setWebhookUrl((json.webhookUrl as string) ?? null);
      if (integ) {
        setTemplateName(integ.couponTemplateName ?? "");
        setTemplateLanguage(integ.couponTemplateLanguage ?? "en");
        setAutoSend(!!integ.autoSendCoupons);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      const json = await fetchWacrm(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          displayName: displayName.trim() || undefined,
        }),
      });
      if (!json.ok) throw new Error((json.error as string) ?? "Connect failed");
      setNotice("WACRM connected successfully.");
      setApiKey("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    try {
      const json = await fetchWacrm(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponTemplateName: templateName.trim() || null,
          couponTemplateLanguage: templateLanguage.trim() || "en",
          autoSendCoupons: autoSend,
        }),
      });
      if (!json.ok) throw new Error((json.error as string) ?? "Save failed");
      setNotice("Coupon delivery settings saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect WACRM? WhatsApp messaging will stop for this account.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const json = await fetchWacrm(ENDPOINT, { method: "DELETE" });
      if (!json.ok) throw new Error((json.error as string) ?? "Disconnect failed");
      setNotice("WACRM disconnected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    try {
      const json = await fetchWacrm("/api/m/communication/status");
      if (!json.ok) throw new Error((json.error as string) ?? "Health check failed");
      if (!json.healthy) {
        throw new Error((json.lastError as string) ?? "WACRM is not responding");
      }
      setNotice("Connection healthy — WACRM API is reachable.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading WACRM settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {!integration ? (
        <form onSubmit={connect} className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#111827]">
            <Plug className="size-4 text-[#25D366]" />
            Connect WhatsApp CRM (WACRM)
          </div>
          <p className="text-xs text-[#6B7280]">
            Deploy WACRM separately, create an API key with all 7 scopes, then paste it here.
            Meta WhatsApp configuration stays inside your WACRM dashboard.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#374151]">WACRM base URL</span>
            <input
              required
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://wacrm.yourdomain.com"
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#374151]">API key</span>
            <input
              required
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="wacrm_live_…"
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-[#374151]">Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1da851] disabled:opacity-60"
          >
            {connecting ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Connect WACRM
          </button>
        </form>
      ) : (
        <>
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#111827]">
                  {integration.accountName ?? "WACRM account"}
                </p>
                <p className="text-xs text-[#6B7280]">
                  Account {integration.accountId} · key …{integration.keyLast4}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#374151] hover:bg-[#F9FAFB]"
                >
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                  Test connection
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Disconnect
                </button>
              </div>
            </div>
            {integration.lastError && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                {integration.lastError}
              </p>
            )}
            {webhookUrl && (
              <div className="flex items-start gap-2 text-xs text-[#6B7280]">
                <Link2 className="size-3.5 mt-0.5 shrink-0" />
                <span>
                  Webhook URL: <code className="font-mono">{webhookUrl}</code>
                  {integration.webhookRegistered ? " (registered)" : " (not registered — needs https)"}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={saveSettings} className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[#111827]">
              <Settings className="size-4" />
              Coupon delivery
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#374151]">Coupon template name</span>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="coupon_winner"
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#374151]">Template language</span>
              <input
                type="text"
                value={templateLanguage}
                onChange={(e) => setTemplateLanguage(e.target.value)}
                placeholder="en or en_US"
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-[#374151]">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                className="rounded"
              />
              Automatically send coupon templates when customers win
            </label>
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-60"
            >
              {savingSettings ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Save settings
            </button>
          </form>
        </>
      )}
    </div>
  );
}
