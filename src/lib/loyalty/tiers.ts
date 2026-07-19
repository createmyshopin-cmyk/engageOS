export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

/** Default lifetime-points thresholds (merchant-editable via /m/loyalty Tiers tab). */
export function tierFromLifetimePoints(points: number): LoyaltyTier {
  if (points >= 10_000) return "platinum";
  if (points >= 3_000) return "gold";
  if (points >= 1_000) return "silver";
  return "bronze";
}

/** Parse a tier slug from the API; falls back to lifetime-points logic. */
export function parseTierSlug(slug: string | null | undefined, lifetimePoints?: number): LoyaltyTier {
  if (slug === "platinum" || slug === "gold" || slug === "silver" || slug === "bronze") {
    return slug;
  }
  return tierFromLifetimePoints(lifetimePoints ?? 0);
}

/** @deprecated Spend-based tiers — use membership tier slug from API instead. */
export function tierFromSpend(totalSpend: number): LoyaltyTier {
  if (totalSpend >= 50_000) return "platinum";
  if (totalSpend >= 20_000) return "gold";
  if (totalSpend >= 5_000) return "silver";
  return "bronze";
}
