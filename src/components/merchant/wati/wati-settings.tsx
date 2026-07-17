"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Link2,
  Loader2,
  Plug,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

/** Bounce to login on 401, otherwise return parsed JSON. */
async function fetchWati(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/m/login?next=/m/integrations/wati";
    return new Promise(() => {});
  }
  return res.json();
}

interface Integration {
  baseUrl: string;
  tokenLast4: string;
  channelName: string | null;
  displayName: string | null;
  status: string;
  lastError: string | null;
  couponTemplateName: string | null;
  couponTemplateLanguage: string;
  autoSendCoupons: boolean;
  participationTemplateName: string | null;
  participationTemplateLanguage: string;
  autoSendParticipation: boolean;
  lastVerifiedAt: string | null;
}

interface WatiTemplate {
  id: string;
  name: string;
  status: string;
  language: string | null;
  category: string | null;
}

const ENDPOINT = "/api/m/integrations/wati";

export function WatiSettings() {
  const [loaded, setLoaded] = useState(false);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Connect form
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Coupon settings
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [autoSend, setAutoSend] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Participation settings
  const [participationTemplateName, setParticipationTemplateName] = useState("");
  const [participationTemplateLanguage, setParticipationTemplateLanguage] = useState("en");
  const [autoSendParticipation, setAutoSendParticipation] = useState(false);

  // Templates + test send
  const [templates, setTemplates] = useState<WatiTemplate[] | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testTemplate, setTestTemplate] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await fetchWati(`${ENDPOINT}`);
      if (!json.ok) throw new Error((json.error as string) ?? "Failed to load");
      const integ = (json.integration as Integration | null) ?? null;
      setIntegration(integ);
      if (integ) {
        setTemplateName(integ.couponTemplateName ?? "");
        setTemplateLanguage(integ.couponTemplateLanguage ?? "en");
        setAutoSend(!!integ.autoSendCoupons);
        setParticipationTemplateName(integ.participationTemplateName ?? "");
        setParticipationTemplateLanguage(integ.participationTemplateLanguage ?? "en");
        setAutoSendParticipation(!!integ.autoSendParticipation);
        setTestTemplate(integ.couponTemplateName ?? "");
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

  const loadTemplates = useCallback(async () => {
    try {
      const json = await fetchWati(`${ENDPOINT}/templates`);
      if (json.ok) {
        // Only approved templates can be sent — hide pending/rejected drafts.
        const approved = ((json.templates as WatiTemplate[]) ?? []).filter(
          (t) => t.status === "APPROVED"
        );
        setTemplates(approved);
      }
    } catch {
      /* non-fatal — the picker just stays a free-text field */
    }
  }, []);

  useEffect(() => {
    if (!integration) return;
    const t = setTimeout(() => loadTemplates(), 0);
    return () => clearTimeout(t);
  }, [integration, loadTemplates]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const json = await fetchWati(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiToken: apiToken.trim(),
          displayName: displayName.trim() || undefined,
        }),
      });
      if (!json.ok) {
        setError((json.error as string) ?? "Failed to connect");
      } else {
        setApiToken("");
        setNotice(`Connected WATI: “${json.displayName ?? json.channelName ?? "WhatsApp"}”.`);
        await load();
      }
    } finally {
      setConnecting(false);
    }
  }

  async function saveCouponSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    setNotice(null);
    try {
      const json = await fetchWati(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponTemplateName: templateName.trim() || null,
          couponTemplateLanguage: templateLanguage.trim() || "en",
          autoSendCoupons: autoSend,
          participationTemplateName: participationTemplateName.trim() || null,
          participationTemplateLanguage: participationTemplateLanguage.trim() || "en",
          autoSendParticipation: autoSendParticipation,
        }),
      });
      if (!json.ok) setError((json.error as string) ?? "Failed to save");
      else setNotice("WATI coupon settings saved.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect WATI? Template sending through WATI will stop.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const json = await fetchWati(ENDPOINT, { method: "DELETE" });
      if (!json.ok) {
        setError((json.error as string) ?? "Failed to disconnect");
      } else {
        setIntegration(null);
        setTemplates(null);
        setNotice("Disconnected from WATI.");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const json = await fetchWati(`${ENDPOINT}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testPhone.trim(),
          templateName: testTemplate.trim(),
        }),
      });
      if (!json.ok) setError((json.error as string) ?? "Test message failed");
      else setNotice(`Test template “${testTemplate.trim()}” sent to ${testPhone.trim()}.`);
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 text-xs font-bold text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading WATI settings…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-2xl border border-[#16A34A]/25 bg-[#F0FDF4] p-4 text-xs font-bold text-[#15803D]">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs font-bold text-[#B91C1C]">
          {error}
        </div>
      )}

      {integration ? (
        <>
          {/* Connected card */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-2xl bg-[#EFF6FF]">
                <ShieldCheck className="size-5 text-[#3B82F6]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#111827]">
                  {integration.displayName ?? integration.channelName ?? "WATI WhatsApp"}
                </p>
                <p className="text-[11px] font-medium text-[#6B7280] truncate">
                  {integration.baseUrl} · Token ••••{integration.tokenLast4}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                    integration.status === "connected"
                      ? "bg-[#DBEAFE] text-[#2563EB]"
                      : "bg-[#FEF3C7] text-[#B45309]"
                  }`}
                >
                  {integration.status}
                </span>
                <button
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#FCA5A5] bg-white px-3 py-2 text-[11px] font-bold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50 transition-colors"
                >
                  {disconnecting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Disconnect
                </button>
              </div>
            </div>
            {integration.lastError && (
              <p className="mt-3 rounded-xl bg-[#FEF2F2] px-3 py-2 text-[11px] font-bold text-[#B91C1C]">
                Last error: {integration.lastError}
              </p>
            )}
          </div>

          {/* WATI templates settings */}
          <form onSubmit={saveCouponSettings} className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-6">
            {/* Section 1: Coupon delivery */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-[#111827]">Coupon Delivery Template</h3>
                <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
                  Choose the approved WATI template used for coupon messages (sent when a customer wins a prize).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Template name
                  </span>
                  {templates && templates.length > 0 ? (
                    <select
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— none —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                          {t.category ? ` · ${t.category}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="coupon_delivery_v1"
                      className={inputCls}
                    />
                  )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Language
                  </span>
                  <input
                    value={templateLanguage}
                    onChange={(e) => setTemplateLanguage(e.target.value)}
                    placeholder="en"
                    className={inputCls}
                  />
                </label>
                <label className="flex items-end gap-2 pb-2.5">
                  <input
                    type="checkbox"
                    checked={autoSend}
                    onChange={(e) => setAutoSend(e.target.checked)}
                    className="size-4 accent-[#3B82F6]"
                  />
                  <span className="text-xs font-bold text-[#111827]">
                    Auto-send coupons on win
                  </span>
                </label>
              </div>
            </div>

            <hr className="border-[#F3F4F6]" />

            {/* Section 2: General Participation delivery */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-[#111827]">Participation Template</h3>
                <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
                  Choose the approved WATI template sent to customers when they play/participate in your campaign but do not win a prize.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Template name
                  </span>
                  {templates && templates.length > 0 ? (
                    <select
                      value={participationTemplateName}
                      onChange={(e) => setParticipationTemplateName(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— none —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                          {t.category ? ` · ${t.category}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={participationTemplateName}
                      onChange={(e) => setParticipationTemplateName(e.target.value)}
                      placeholder="participation_thank_you"
                      className={inputCls}
                    />
                  )}
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Language
                  </span>
                  <input
                    value={participationTemplateLanguage}
                    onChange={(e) => setParticipationTemplateLanguage(e.target.value)}
                    placeholder="en"
                    className={inputCls}
                  />
                </label>
                <label className="flex items-end gap-2 pb-2.5">
                  <input
                    type="checkbox"
                    checked={autoSendParticipation}
                    onChange={(e) => setAutoSendParticipation(e.target.checked)}
                    className="size-4 accent-[#3B82F6]"
                  />
                  <span className="text-xs font-bold text-[#111827]">
                    Auto-send on play (no win)
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#2563EB] disabled:opacity-50 transition-colors"
              >
                {savingSettings && <Loader2 className="size-3.5 animate-spin" />}
                Save settings
              </button>
            </div>
          </form>

          {/* Test send */}
          <form onSubmit={sendTest} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h3 className="flex items-center gap-2 text-sm font-black text-[#111827]">
              <Send className="size-4 text-[#3B82F6]" />
              Send a test message
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
              Confirm the connection end-to-end by sending an approved template to your own number.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Recipient (with country code)
                </span>
                <input
                  required
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 919999999999"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Template name
                </span>
                <input
                  required
                  value={testTemplate}
                  onChange={(e) => setTestTemplate(e.target.value)}
                  placeholder="hello_world"
                  className={inputCls}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={testing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#3B82F6] bg-white px-4 py-2.5 text-xs font-bold text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Send test
            </button>
          </form>
        </>
      ) : (
        /* Connect form */
        <form onSubmit={connect} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#111827]">
            <Plug className="size-4 text-[#3B82F6]" />
            Connect WATI
          </h3>
          <p className="mt-1 text-[11px] text-[#6B7280] font-medium">
            Find both values in your WATI dashboard under <strong>Connector → API</strong>. The
            token is shown only once when generated.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                API Endpoint
              </span>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://live-mt-server.wati.io/1234567"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                API Token (Bearer)
              </span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  required
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1..."
                  className={`${inputCls} pl-9`}
                />
              </div>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Display name (optional)
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Store WhatsApp Line"
                className={inputCls}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={connecting}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#2563EB] disabled:opacity-50 transition-colors"
          >
            {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
            Verify & Connect
          </button>
        </form>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#3B82F6] focus:outline-none";
