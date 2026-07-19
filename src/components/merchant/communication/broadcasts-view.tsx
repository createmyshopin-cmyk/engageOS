"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { commFetch } from "./api";

interface BroadcastRow {
  id: string;
  wacrm_broadcast_id: string;
  name: string;
  template_name: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
}

export function BroadcastsView() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en");
  const [phones, setPhones] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<{ broadcasts: BroadcastRow[] }>(
        "/api/m/communication/broadcasts"
      );
      setBroadcasts(json.broadcasts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load broadcasts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    const phoneList = phones
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!phoneList.length) return;

    setSending(true);
    setError(null);
    try {
      await commFetch("/api/m/communication/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          templateName: templateName.trim(),
          templateLanguage: templateLanguage.trim(),
          phones: phoneList,
        }),
      });
      setName("");
      setPhones("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch broadcast");
    } finally {
      setSending(false);
    }
  }

  async function refreshStatus(wacrmId: string) {
    setRefreshingId(wacrmId);
    try {
      await commFetch(`/api/m/communication/broadcasts/${wacrmId}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh status");
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={launch} className="rounded-2xl border border-[#E5E7EB] bg-white p-6 space-y-4">
        <h2 className="text-sm font-bold text-[#111827]">Launch template broadcast</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
            className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
          <input
            required
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name (approved in WACRM)"
            className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
          <input
            value={templateLanguage}
            onChange={(e) => setTemplateLanguage(e.target.value)}
            placeholder="Language (en / en_US)"
            className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
        </div>
        <textarea
          required
          value={phones}
          onChange={(e) => setPhones(e.target.value)}
          placeholder="Recipient phones — one per line or comma-separated (max 1000)"
          rows={5}
          className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Send broadcast
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E5E7EB] text-xs font-bold text-[#6B7280] uppercase">
          Broadcast history
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-[#6B7280]">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : broadcasts.length === 0 ? (
          <p className="p-6 text-sm text-[#6B7280]">No broadcasts launched from EngageOS yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {broadcasts.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">{b.template_name}</td>
                  <td className="px-4 py-3 capitalize">{b.status}</td>
                  <td className="px-4 py-3">{b.sent_count}/{b.total_recipients}</td>
                  <td className="px-4 py-3">{b.delivered_count}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => refreshStatus(b.wacrm_broadcast_id)}
                      disabled={refreshingId === b.wacrm_broadcast_id}
                      className="text-[#6B7280] hover:text-[#111827]"
                    >
                      <RefreshCw
                        className={`size-4 ${
                          refreshingId === b.wacrm_broadcast_id ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
