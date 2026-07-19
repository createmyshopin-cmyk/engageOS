"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, AlertTriangle, RefreshCw, Check } from "lucide-react";
import { useLoyaltyRules, useUpdateLoyaltyRules } from "@/lib/api/hooks/use-loyalty-rules";
import type { PointsRuleDTO } from "@/lib/api/types";

const RULE_META: Record<
  string,
  { label: string; description: string; field: "pointsPerUnit" | "fixedPoints" }
> = {
  purchase: {
    label: "Purchase",
    description: "Points per ₹100 spent on Shopify orders",
    field: "pointsPerUnit",
  },
  signup: { label: "Signup", description: "Bonus when a new customer registers", field: "fixedPoints" },
  first_purchase: {
    label: "First Purchase",
    description: "One-time bonus on first paid order",
    field: "fixedPoints",
  },
  campaign_play: {
    label: "Scratch & Win",
    description: "Default points when prize value is not set",
    field: "fixedPoints",
  },
  birthday: { label: "Birthday", description: "Annual birthday bonus (automation in Phase 5)", field: "fixedPoints" },
  referral: { label: "Referral", description: "When a referred friend signs up", field: "fixedPoints" },
  review: { label: "Product Review", description: "After leaving a product review", field: "fixedPoints" },
};

export function LoyaltyRulesPanel() {
  const rules = useLoyaltyRules();
  const update = useUpdateLoyaltyRules();
  const [draft, setDraft] = useState<PointsRuleDTO[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rules.data) setDraft(rules.data);
  }, [rules.data]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  function patchRule(ruleType: string, patch: Partial<PointsRuleDTO>) {
    setSaved(false);
    setDraft((prev) => prev.map((r) => (r.ruleType === ruleType ? { ...r, ...patch } : r)));
  }

  async function save() {
    await update.mutateAsync(draft);
    setSaved(true);
  }

  if (rules.isLoading) {
    return <div className="h-48 bg-neutral-100 rounded-3xl animate-pulse" />;
  }

  if (rules.isError) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-12 px-8 text-center">
        <AlertTriangle className="size-8 text-red-300 mb-2" />
        <p className="text-xs text-neutral-500 max-w-xs">
          {rules.error instanceof Error ? rules.error.message : "Failed to load rules."}
        </p>
        <button
          onClick={() => rules.refetch()}
          className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-neutral-700"
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-neutral-900">Points Rules</h2>
          <p className="text-[11px] text-neutral-500">Configure how customers earn points</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
              <Check className="size-3.5" /> Saved
            </span>
          )}
          <button
            onClick={save}
            disabled={update.isPending || draft.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-50"
          >
            {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </button>
        </div>
      </div>

      {update.isError && (
        <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">
          <AlertTriangle className="size-4 shrink-0" />
          {update.error instanceof Error ? update.error.message : "Save failed"}
        </div>
      )}

      {draft.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm px-6 py-12 text-center">
          <p className="text-xs text-neutral-500">No earn rules found. They will be created on first load.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {draft.map((rule) => {
            const meta = RULE_META[rule.ruleType];
            if (!meta) return null;
            const isPurchase = meta.field === "pointsPerUnit";
            return (
              <div
                key={rule.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 transition ${
                  rule.active ? "border-neutral-200/80" : "border-neutral-100 opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">{meta.label}</p>
                    <p className="text-[10px] text-neutral-500">{meta.description}</p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-bold text-neutral-500">
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) => patchRule(rule.ruleType, { active: e.target.checked })}
                      className="rounded border-neutral-300"
                    />
                    Active
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {isPurchase ? (
                    <>
                      <span className="text-xs text-neutral-500">₹100 =</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!rule.active}
                        value={rule.pointsPerUnit ?? 0}
                        onChange={(e) =>
                          patchRule(rule.ruleType, { pointsPerUnit: Number(e.target.value) })
                        }
                        className="w-20 px-2 py-1.5 rounded-lg border border-neutral-200 text-sm font-bold disabled:bg-neutral-50"
                      />
                      <span className="text-xs text-neutral-500">points</span>
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        disabled={!rule.active}
                        value={rule.fixedPoints ?? 0}
                        onChange={(e) =>
                          patchRule(rule.ruleType, { fixedPoints: Number(e.target.value) })
                        }
                        className="w-24 px-2 py-1.5 rounded-lg border border-neutral-200 text-sm font-bold disabled:bg-neutral-50"
                      />
                      <span className="text-xs text-neutral-500">points</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
