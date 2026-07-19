"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Plug,
  Trash2,
  Zap,
} from "lucide-react";
import type { ZapierHookPublic, ZapierIntegrationPublic } from "@/lib/zapier/types";

async function fetchZapier(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/integrations/zapier";
    return new Promise(() => {});
  }
  return res.json();
}

interface TriggerInfo {
  event: string;
  description: string;
}

const ENDPOINT = "/api/m/integrations/zapier";

export function ZapierSettings() {
  const [loaded, setLoaded] = useState(false);
  const [integration, setIntegration] = useState<ZapierIntegrationPublic | null>(null);
  const [hooks, setHooks] = useState<ZapierHookPublic[]>([]);
  const [triggers, setTriggers] = useState<TriggerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKeyOnce, setApiKeyOnce] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await fetchZapier(ENDPOINT);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      setIntegration((json.integration as ZapierIntegrationPublic) ?? null);
      setHooks((json.hooks as ZapierHookPublic[]) ?? []);
      setTriggers((json.triggers as TriggerInfo[]) ?? []);
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

  const connected = integration?.status === "connected";

  async function connect() {
    setConnecting(true);
    setError(null);
    setNotice(null);
    setApiKeyOnce(null);
    try {
      const json = await fetchZapier(ENDPOINT, { method: "POST" });
      if (!json.ok) setError((json.error as string) ?? "Failed to connect");
      else {
        setApiKeyOnce((json.apiKey as string) ?? null);
        setNotice((json.message as string) ?? "Connected. Copy your API key now.");
        await load();
      }
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Zapier? Active Zaps will stop receiving events.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const json = await fetchZapier(ENDPOINT, { method: "DELETE" });
      if (!json.ok) setError((json.error as string) ?? "Failed to disconnect");
      else {
        setApiKeyOnce(null);
        setNotice("Zapier disconnected.");
        await load();
      }
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyApiKey() {
    if (!apiKeyOnce) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(apiKeyOnce);
      setNotice("API key copied to clipboard.");
    } finally {
      setCopying(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#FF4A00]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-[#FF4A00]" />
          <h2 className="text-sm font-black text-[#111827]">API Key</h2>
        </div>
        <p className="text-xs text-[#6B7280] font-medium leading-relaxed">
          Generate an API key and paste it when connecting EngageOS in Zapier. The key is shown
          only once — store it securely.
        </p>

        {apiKeyOnce && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
              Copy now — won&apos;t be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-white border border-amber-100 px-3 py-2 text-xs font-mono text-[#111827]">
                {apiKeyOnce}
              </code>
              <button
                type="button"
                onClick={copyApiKey}
                disabled={copying}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FF4A00] hover:bg-[#E64300] text-white text-xs font-bold px-3 py-2 transition-colors"
              >
                <Copy className="size-3.5" />
                Copy
              </button>
            </div>
          </div>
        )}

        {connected && integration?.apiKeyPrefix && !apiKeyOnce && (
          <div className="flex items-center gap-2 rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
            <CheckCircle2 className="size-4 text-[#16A34A]" />
            <span className="text-xs font-bold text-neutral-600">
              Active key: {integration.apiKeyPrefix}…
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button
              type="button"
              onClick={connect}
              disabled={connecting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF4A00] hover:bg-[#E64300] text-white text-xs font-bold px-4 py-2 transition-all shadow-sm disabled:opacity-60"
            >
              {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
              Generate API Key
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-neutral-50 text-[#111827] text-xs font-bold px-4 py-2 transition-all disabled:opacity-60"
              >
                {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                Regenerate Key
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-bold px-4 py-2 transition-all disabled:opacity-60"
              >
                {disconnecting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Disconnect
              </button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-black text-[#111827]">Install on Zapier</h2>
        <ol className="list-decimal list-inside space-y-2 text-xs text-[#6B7280] font-medium">
          <li>Generate an API key above.</li>
          <li>
            Open Zapier and search for <strong className="text-[#111827]">EngageOS</strong> (or use
            your private app invite link after publishing).
          </li>
          <li>Paste the API key when prompted.</li>
          <li>Create a Zap with an EngageOS trigger (e.g. Coupon Redeemed) and any action app.</li>
        </ol>
        <a
          href="https://zapier.com/apps"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#FF4A00] hover:text-[#E64300] transition-colors"
        >
          Open Zapier
          <ExternalLink className="size-3.5" />
        </a>
      </section>

      {connected && (
        <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-black text-[#111827]">Active subscriptions</h2>
          <p className="text-xs text-[#6B7280] font-medium">
            {integration?.activeSubscriptions ?? 0} live REST Hook
            {(integration?.activeSubscriptions ?? 0) === 1 ? "" : "s"} from Zapier.
          </p>
          {hooks.length > 0 && (
            <ul className="space-y-2">
              {hooks.map((hook) => (
                <li
                  key={hook.id}
                  className="flex items-center justify-between rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2"
                >
                  <span className="text-xs font-bold text-[#111827]">{hook.eventName}</span>
                  <span className="text-[10px] font-medium text-neutral-500">
                    {hook.lastDeliveryAt
                      ? `Last fired ${new Date(hook.lastDeliveryAt).toLocaleString()}`
                      : "Not fired yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-black text-[#111827]">Supported triggers</h2>
        <ul className="space-y-2">
          {triggers.map((t) => (
            <li key={t.event} className="rounded-xl bg-neutral-50 border border-neutral-100 px-3 py-2">
              <p className="text-xs font-bold text-[#111827]">{t.event}</p>
              <p className="text-[11px] text-[#6B7280] font-medium mt-0.5">{t.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
