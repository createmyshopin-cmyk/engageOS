"use client";

import React, { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plug, ShieldCheck, Trash2, Webhook } from "lucide-react";
import { LoadingPanel } from "./overview-tab";
import { fetchAdapter } from "./api";

interface StatusPayload {
  connected: boolean;
  integration: {
    baseUrl: string;
    keyLast4: string;
    accountName: string | null;
    status: string;
    webhookRegistered: boolean;
    couponTemplateName: string | null;
    couponTemplateLanguage: string;
    autoSendCoupons: boolean;
    lastVerifiedAt: string | null;
    phoneNumberId?: string;
    wabaId?: string;
  } | null;
}

/** Settings tab — connect/disconnect WhatsApp business API locally + coupon settings. */
export function SettingsTab({
  onConnectionChange,
}: {
  onConnectionChange: (connected: boolean, baseUrl: string | null) => void;
}) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [pin, setPin] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [autoSend, setAutoSend] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await fetchAdapter("/api/m/whatsapp/status");
      if (!json.ok) throw new Error(json.error);
      setStatus(json);
      if (json.integration) {
        setTemplateName(json.integration.couponTemplateName ?? "");
        setTemplateLanguage(json.integration.couponTemplateLanguage ?? "en");
        setAutoSend(!!json.integration.autoSendCoupons);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          verifyToken: verifyToken.trim(),
          pin: pin.trim(),
        }),
      });
      if (!json.ok) {
        setError(json.error ?? "Failed to connect");
      } else {
        setAccessToken("");
        setPin("");
        setNotice(
          `Connected WhatsApp number: “${json.accountName}”.` +
            (json.webhookRegistered
              ? " Webhook registration request completed."
              : " Check WhatsApp configuration in Meta developers console.")
        );
        await load();
        onConnectionChange(true, "http://localhost:3000");
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
      const json = await fetchAdapter("/api/m/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couponTemplateName: templateName.trim() || null,
          couponTemplateLanguage: templateLanguage.trim() || "en",
          autoSendCoupons: autoSend,
        }),
      });
      if (!json.ok) setError(json.error ?? "Failed to save");
      else setNotice("Coupon delivery settings saved.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect WhatsApp Integration? Active messaging will stop.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/settings", { method: "DELETE" });
      if (!json.ok) {
        setError(json.error ?? "Failed to disconnect");
      } else {
        setStatus((s) => (s ? { ...s, connected: false, integration: null } : s));
        setNotice("Disconnected from WhatsApp.");
        onConnectionChange(false, null);
      }
    } finally {
      setDisconnecting(false);
    }
  }

  if (!status) {
    if (error) {
      return (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 text-xs font-bold text-[#B91C1C]">
          {error}
        </div>
      );
    }
    return <LoadingPanel label="Loading settings…" />;
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

      {status.integration ? (
        <>
          {/* Connected card */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-2xl bg-[#DCFCE7]">
                <ShieldCheck className="size-5 text-[#16A34A]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-[#111827]">
                  {status.integration.accountName ?? "WhatsApp Business Line"}
                </p>
                <p className="text-[11px] font-medium text-[#6B7280]">
                  Phone ID: {status.integration.phoneNumberId || "Connected"} · WABA ID: {status.integration.wabaId || "Connected"}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${
                    status.integration.status === "connected"
                      ? "bg-[#DCFCE7] text-[#16A34A]"
                      : "bg-[#FEF3C7] text-[#B45309]"
                  }`}
                >
                  {status.integration.status}
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
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
              <Webhook className="size-4 text-[#6B7280]" />
              <p className="text-[11px] font-medium text-[#374151]">
                Webhook Endpoint is ready. Setup webhook verification token in Meta Console pointing to: <strong>{typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : ""}</strong>
              </p>
            </div>
          </div>

          {/* Coupon delivery settings */}
          <form onSubmit={saveCouponSettings} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
            <h3 className="text-sm font-black text-[#111827]">Coupon Delivery</h3>
            <p className="mt-1 text-[11px] font-medium text-[#6B7280]">
              When a customer wins, EngageOS can send their coupon automatically via WhatsApp.
              Params are filled as: 1 = customer name, 2 = prize name, 3 = coupon code.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Template name
                </span>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="coupon_delivery_v1"
                  className={inputCls}
                />
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
                  className="size-4 accent-[#16A34A]"
                />
                <span className="text-xs font-bold text-[#111827]">
                  Auto-send coupons on win
                </span>
              </label>
            </div>
            <button
              type="submit"
              disabled={savingSettings}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-50 transition-colors"
            >
              {savingSettings && <Loader2 className="size-3.5 animate-spin" />}
              Save settings
            </button>
          </form>
        </>
      ) : (
        /* Connect form */
        <form onSubmit={connect} className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-black text-[#111827]">
            <Plug className="size-4 text-[#16A34A]" />
            Configure WhatsApp API
          </h3>
          <p className="mt-1 text-[11px] text-[#6B7280] font-medium">
            Enter your Meta Cloud API details to link your WhatsApp Business number.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Meta Access Token (System User or Temporary)
              </span>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  required
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAGz..."
                  className={`${inputCls} pl-9`}
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Phone Number ID
              </span>
              <input
                required
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 104576392019482"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                WhatsApp Business Account ID
              </span>
              <input
                required
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="e.g. 102947264028472"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Webhook Verify Token
              </span>
              <input
                required
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                placeholder="e.g. engageos_verify_token"
                className={inputCls}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Two-Step Verification PIN (Optional)
              </span>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="6-digit PIN"
                maxLength={6}
                className={inputCls}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={connecting}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-green-500/20 hover:bg-[#15803D] disabled:opacity-50 transition-colors"
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
  "w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:outline-none";
