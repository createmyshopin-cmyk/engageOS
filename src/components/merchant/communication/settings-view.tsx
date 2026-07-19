"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, PanelRightOpen } from "lucide-react";
import { WacrmSettings } from "@/components/merchant/wacrm/wacrm-settings";
import { CommunicationEventRulesEditor } from "@/components/merchant/communication/event-rules-editor";
import { commFetch } from "./api";

interface AdvancedFeature {
  id: string;
  label: string;
  description: string;
  embedPath: string;
}

export function CommunicationSettingsView() {
  const [advanced, setAdvanced] = useState<AdvancedFeature[]>([]);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [ssoConfigured, setSsoConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<{
        baseUrl: string;
        advanced: AdvancedFeature[];
        ssoConfigured?: boolean;
      }>("/api/m/communication/settings");
      setBaseUrl(json.baseUrl);
      setAdvanced(json.advanced ?? []);
      setSsoConfigured(json.ssoConfigured !== false);
    } catch (err) {
      setAdvanced([]);
      setBaseUrl(null);
      if (err instanceof Error && !err.message.includes("not connected")) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[#111827]">EngageOS bridge</h2>
        <WacrmSettings />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[#111827]">Event-driven messaging</h2>
        <CommunicationEventRulesEditor />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[#111827]">Advanced features (WACRM)</h2>
        <p className="text-xs text-[#6B7280]">
          Templates, automations, flows, AI, and Meta configuration live in your WACRM
          dashboard. Open them here without leaving EngageOS, or in a new tab.
        </p>

        {!ssoConfigured && (
          <p className="text-xs text-amber-700 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            Set <code className="font-mono">ENGAGEOS_WACRM_SSO_SECRET</code> on EngageOS and
            WACRM for seamless sign-in. Until then, use Open in WACRM after logging in there.
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="text-xs text-amber-700">{error}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {advanced.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-4 hover:border-[#25D366] transition-colors"
              >
                <p className="text-sm font-bold text-[#111827]">{item.label}</p>
                <p className="text-xs text-[#6B7280] mt-1">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={item.embedPath}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#111827] text-white text-[11px] font-bold px-3 py-1.5 hover:bg-[#25D366] transition-colors"
                  >
                    <PanelRightOpen className="size-3.5" />
                    Open here
                  </Link>
                  <AdvancedExternalLink featureId={item.id} />
                </div>
              </div>
            ))}
          </div>
        )}

        {baseUrl && (
          <p className="text-xs text-[#6B7280]">
            WACRM instance:{" "}
            <a href={baseUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {baseUrl}
            </a>
          </p>
        )}

        <Link
          href="/m/integrations/wacrm"
          className="inline-block text-xs font-bold text-[#3B82F6] hover:underline"
        >
          Manage integration credentials →
        </Link>
      </section>
    </div>
  );
}

function AdvancedExternalLink({ featureId }: { featureId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    commFetch<{ launchUrl: string }>(`/api/m/communication/advanced/${featureId}`)
      .then((json) => {
        if (alive) setUrl(json.launchUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [featureId]);

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9CA3AF] px-3 py-1.5">
        <Loader2 className="size-3 animate-spin" />
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] text-[11px] font-bold text-[#374151] px-3 py-1.5 hover:border-[#25D366]"
    >
      <ExternalLink className="size-3.5" />
      New tab
    </a>
  );
}
