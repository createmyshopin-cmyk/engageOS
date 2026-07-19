"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, AlertTriangle, Crown, RefreshCw, Check } from "lucide-react";
import { useMembershipTiers, useUpdateMembershipTiers } from "@/lib/api/hooks/use-membership-tiers";
import type { MembershipTierDTO } from "@/lib/api/types";
import { LoyaltyTierBadge } from "@/components/merchant/loyalty/loyalty-tier-badge";

export function LoyaltyTiersPanel() {
  const tiers = useMembershipTiers();
  const update = useUpdateMembershipTiers();
  const [draft, setDraft] = useState<MembershipTierDTO[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tiers.data) setDraft(tiers.data);
  }, [tiers.data]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  function patchTier(slug: string, patch: Partial<MembershipTierDTO>) {
    setSaved(false);
    setDraft((prev) => prev.map((t) => (t.slug === slug ? { ...t, ...patch } : t)));
  }

  async function save() {
    await update.mutateAsync(draft);
    setSaved(true);
  }

  if (tiers.isLoading) {
    return <div className="h-48 bg-neutral-100 rounded-3xl animate-pulse" />;
  }

  if (tiers.isError) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-12 px-8 text-center">
        <AlertTriangle className="size-8 text-red-300 mb-2" />
        <p className="text-xs text-neutral-500 max-w-xs">
          {tiers.error instanceof Error ? tiers.error.message : "Failed to load tiers."}
        </p>
        <button
          onClick={() => tiers.refetch()}
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
          <h2 className="text-sm font-black text-neutral-900">Membership Tiers</h2>
          <p className="text-[11px] text-neutral-500">
            Customers auto-upgrade based on lifetime points earned
          </p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {draft.map((tier) => (
          <div
            key={tier.id}
            className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-4 space-y-3"
            style={{ borderTopColor: tier.color, borderTopWidth: 3 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="size-4" style={{ color: tier.color }} />
                <LoyaltyTierBadge tier={tier.slug} />
              </div>
              <span className="text-[10px] font-bold text-neutral-400">
                {tier.minPoints.toLocaleString("en-IN")}
                {tier.maxPoints != null ? ` – ${tier.maxPoints.toLocaleString("en-IN")}` : "+"} pts
              </span>
            </div>
            <input
              value={tier.name}
              onChange={(e) => patchTier(tier.slug, { name: e.target.value })}
              className="w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-sm font-bold"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] font-semibold text-neutral-500">
                Min points
                <input
                  type="number"
                  min={0}
                  value={tier.minPoints}
                  onChange={(e) => patchTier(tier.slug, { minPoints: Number(e.target.value) })}
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-xs"
                />
              </label>
              <label className="text-[10px] font-semibold text-neutral-500">
                Max points
                <input
                  type="number"
                  min={0}
                  value={tier.maxPoints ?? ""}
                  placeholder="∞"
                  onChange={(e) =>
                    patchTier(tier.slug, {
                      maxPoints: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-xs"
                />
              </label>
            </div>
            <label className="text-[10px] font-semibold text-neutral-500 block">
              Bonus multiplier
              <input
                type="number"
                min={1}
                step={0.05}
                value={tier.bonusMultiplier}
                onChange={(e) => patchTier(tier.slug, { bonusMultiplier: Number(e.target.value) })}
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-xs"
              />
            </label>
            <label className="text-[10px] font-semibold text-neutral-500 block">
              Benefits (comma-separated)
              <input
                value={tier.benefits.join(", ")}
                onChange={(e) =>
                  patchTier(tier.slug, {
                    benefits: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Free shipping, Early access"
                className="mt-1 w-full px-2 py-1.5 rounded-lg border border-neutral-200 text-xs"
              />
            </label>
            {tier.benefits.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {tier.benefits.map((b) => (
                  <li
                    key={b}
                    className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
