import "server-only";
import { z } from "zod";

const joinedFilter = z.enum(["7d", "30d", "90d"]).optional();
const rewardFilter = z.enum(["all", "has_code", "active", "redeemed", "no_reward"]).optional();
const couponStatus = z.enum(["issued", "redeemed", "expired"]).optional();

export const feedTypeEnum = z.enum([
  "all_customers",
  "new_customers",
  "reward_customers",
  "tag",
  "campaign",
  "campaigns_summary",
  "shopify_codes",
]);

export const sheetsExportQuery = z.object({
  feed: feedTypeEnum,
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  search: z.string().optional(),
  rewardFilter,
  joined: joinedFilter,
  joinedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  joinedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tagId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  status: couponStatus,
});

export const sheetsCustomersQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  search: z.string().optional(),
  rewardFilter,
  joined: joinedFilter,
  joinedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  joinedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const sheetsCodesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  status: couponStatus,
  campaignId: z.string().uuid().optional(),
});

export const feedInputSchema = z.object({
  feedType: feedTypeEnum,
  tabName: z.string().trim().min(1).max(100),
  campaignId: z.string().uuid().nullable().optional(),
  tagId: z.string().uuid().nullable().optional(),
  config: z
    .object({
      joinedDays: z.number().int().min(1).max(365).optional(),
    })
    .optional(),
  enabled: z.boolean().optional(),
});

export const replaceFeedsBody = z.object({
  feeds: z.array(feedInputSchema),
});

export type SheetsExportQuery = z.infer<typeof sheetsExportQuery>;
export type SheetsCustomersQuery = z.infer<typeof sheetsCustomersQuery>;
export type SheetsCodesQuery = z.infer<typeof sheetsCodesQuery>;
export type ReplaceFeedsBody = z.infer<typeof replaceFeedsBody>;
