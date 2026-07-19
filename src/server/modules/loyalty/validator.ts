import { z } from "zod";

/**
 * Zod validator for the loyalty module. business_id is NEVER accepted — it's
 * derived from the authenticated principal. The customer id is the only input.
 */
export const loyaltyParam = z.object({
  customerId: z.string().uuid("Invalid customer id"),
});
export type LoyaltyParam = z.infer<typeof loyaltyParam>;

export const loyaltyLeaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LoyaltyLeaderboardQuery = z.infer<typeof loyaltyLeaderboardQuery>;

export const loyaltyHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type LoyaltyHistoryQuery = z.infer<typeof loyaltyHistoryQuery>;

export const loyaltyAdjustBody = z.object({
  delta: z.number().int().refine((n) => n !== 0, "Delta must be non-zero"),
  note: z.string().max(500).optional(),
});
export type LoyaltyAdjustBody = z.infer<typeof loyaltyAdjustBody>;

const ruleUpdateItem = z.object({
  ruleType: z.string().min(1),
  pointsPerUnit: z.number().min(0).nullable().optional(),
  fixedPoints: z.number().int().min(0).nullable().optional(),
  multiplier: z.number().min(0).optional(),
  active: z.boolean().optional(),
});

export const loyaltyRulesUpdateBody = z.object({
  rules: z.array(ruleUpdateItem).min(1),
});
export type LoyaltyRulesUpdateBody = z.infer<typeof loyaltyRulesUpdateBody>;

const tierUpdateItem = z.object({
  slug: z.enum(["bronze", "silver", "gold", "platinum"]),
  name: z.string().min(1).optional(),
  minPoints: z.number().int().min(0).optional(),
  maxPoints: z.number().int().min(0).nullable().optional(),
  color: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  bonusMultiplier: z.number().min(0).optional(),
  benefits: z.array(z.string()).optional(),
});

export const loyaltyTiersUpdateBody = z.object({
  tiers: z.array(tierUpdateItem).min(1),
});
export type LoyaltyTiersUpdateBody = z.infer<typeof loyaltyTiersUpdateBody>;
