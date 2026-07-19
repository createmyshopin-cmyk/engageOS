import type { LoyaltyTier } from "@/lib/loyalty/tiers";

const TIER_STYLES: Record<LoyaltyTier, string> = {
  bronze: "bg-orange-100 text-orange-800 border-orange-200",
  silver: "bg-slate-100 text-slate-700 border-slate-200",
  gold: "bg-amber-100 text-amber-800 border-amber-200",
  platinum: "bg-violet-100 text-violet-800 border-violet-200",
};

const TIER_LABELS: Record<LoyaltyTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

export function LoyaltyTierBadge({ tier }: { tier: LoyaltyTier }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_STYLES[tier]}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

export function tierLabel(tier: LoyaltyTier): string {
  return TIER_LABELS[tier];
}
