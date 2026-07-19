import { z } from "zod";
import { istDateRangeToTimestamps } from "@/lib/merchant/ist-date";

export const winnerPrizeCategory = z.enum(["all", "coupon", "gift", "scratch_win"]);
export type WinnerPrizeCategory = z.infer<typeof winnerPrizeCategory>;

/** Active + ended (completed) by default; narrow to one lifecycle bucket when no campaign is selected. */
export const winnerCampaignScope = z.enum(["eligible", "active", "ended"]);
export type WinnerCampaignScope = z.infer<typeof winnerCampaignScope>;

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .optional();

const winnerFilters = {
  search: z.string().trim().max(120).optional(),
  prizeCategory: winnerPrizeCategory.optional(),
  campaignId: z.string().uuid().optional(),
  campaignScope: winnerCampaignScope.optional(),
  wonFrom: dateOnly,
  wonTo: dateOnly,
};

/** Query params for GET /api/v1/winners */
export const listWinnersQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    ...winnerFilters,
  })
  .refine(
    (q) => {
      if (!q.wonFrom || !q.wonTo) return true;
      return q.wonFrom <= q.wonTo;
    },
    { message: "wonFrom must be on or before wonTo", path: ["wonTo"] }
  );
export type ListWinnersQuery = z.infer<typeof listWinnersQuery>;

/** Query params for GET /api/v1/winners/summary */
export const winnersSummaryQuery = z
  .object({
    wonFrom: dateOnly,
    wonTo: dateOnly,
  })
  .refine(
    (q) => {
      if (!q.wonFrom || !q.wonTo) return true;
      return q.wonFrom <= q.wonTo;
    },
    { message: "wonFrom must be on or before wonTo", path: ["wonTo"] }
  );
export type WinnersSummaryQuery = z.infer<typeof winnersSummaryQuery>;

/** Query params for GET /api/v1/winners/export */
export const exportWinnersQuery = z
  .object({
    ...winnerFilters,
  })
  .refine(
    (q) => {
      if (!q.wonFrom || !q.wonTo) return true;
      return q.wonFrom <= q.wonTo;
    },
    { message: "wonFrom must be on or before wonTo", path: ["wonTo"] }
  );
export type ExportWinnersQuery = z.infer<typeof exportWinnersQuery>;

export interface WinnerListFilters {
  search: string | null;
  prizeCategory: WinnerPrizeCategory;
  campaignId: string | null;
  campaignScope: WinnerCampaignScope;
  wonFrom: string | null;
  wonTo: string | null;
}

export function parseWinnerFilters(query: {
  search?: string;
  prizeCategory?: WinnerPrizeCategory;
  campaignId?: string;
  campaignScope?: WinnerCampaignScope;
  wonFrom?: string;
  wonTo?: string;
}): WinnerListFilters {
  return {
    search: query.search?.trim() ? query.search.trim() : null,
    prizeCategory: query.prizeCategory ?? "all",
    campaignId: query.campaignId ?? null,
    campaignScope: query.campaignScope ?? "eligible",
    wonFrom: query.wonFrom ?? null,
    wonTo: query.wonTo ?? null,
  };
}

export function dateRangeToTimestamps(from: string | null, to: string | null): {
  from: string | null;
  to: string | null;
} {
  return istDateRangeToTimestamps(from, to);
}
