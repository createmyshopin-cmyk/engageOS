"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { commFetch } from "./api";

interface RuleRow {
  eventType: string;
  label: string;
  enabled: boolean;
  templateName: string | null;
  templateLanguage: string;
}

export function CommunicationEventRulesEditor() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<{ rules: RuleRow[] }>("/api/m/communication/rules");
      setRules(json.rules ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function updateRule(eventType: string, patch: Partial<RuleRow>) {
    setRules((prev) =>
      prev.map((r) => (r.eventType === eventType ? { ...r, ...patch } : r))
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await commFetch("/api/m/communication/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: rules.map((r) => ({
            eventType: r.eventType,
            enabled: r.enabled,
            templateName: r.templateName,
            templateLanguage: r.templateLanguage,
          })),
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rules");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7280]">
        <Loader2 className="size-4 animate-spin" />
        Loading automation rules…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#6B7280]">
        Map business events to approved WhatsApp templates. Jobs are queued automatically and
        sent by the communication worker (every 10 minutes). Coupon delivery still uses the
        bridge settings above.
      </p>

      {error && <p className="text-xs text-amber-700">{error}</p>}

      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.eventType}
            className="rounded-xl border border-[#E5E7EB] bg-white p-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]"
          >
            <div>
              <p className="text-xs font-bold text-[#111827]">{rule.label}</p>
              <p className="text-[10px] text-[#9CA3AF] font-mono">{rule.eventType}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#374151]">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => updateRule(rule.eventType, { enabled: e.target.checked })}
                className="rounded border-[#D1D5DB]"
              />
              On
            </label>
            <input
              type="text"
              placeholder="Template name"
              value={rule.templateName ?? ""}
              onChange={(e) =>
                updateRule(rule.eventType, {
                  templateName: e.target.value.trim() || null,
                })
              }
              className="text-xs rounded-lg border border-[#E5E7EB] px-2.5 py-1.5"
            />
            <input
              type="text"
              placeholder="en"
              value={rule.templateLanguage}
              onChange={(e) =>
                updateRule(rule.eventType, { templateLanguage: e.target.value || "en" })
              }
              className="text-xs rounded-lg border border-[#E5E7EB] px-2.5 py-1.5 w-16"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-[#111827] text-white text-xs font-bold px-4 py-2.5 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        {saved ? "Saved" : "Save rules"}
      </button>
    </div>
  );
}
