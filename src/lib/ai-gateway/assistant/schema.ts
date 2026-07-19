import { z } from "zod";

export const ASSISTANT_ACTIONS = [
  "get_analytics_overview",
  "get_communication_stats",
  "count_coupons_redeemed_today",
  "list_inactive_customers",
  "list_vip_customers",
  "propose_broadcast",
] as const;

export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];

export const assistantPlanSchema = z.object({
  reply: z.string().min(1),
  action: z.enum(ASSISTANT_ACTIONS).nullable(),
  params: z.record(z.string(), z.unknown()).optional().default({}),
});

export type AssistantPlan = z.infer<typeof assistantPlanSchema>;

export const inactiveParamsSchema = z.object({
  inactiveDays: z.coerce.number().int().min(7).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const vipParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minSpend: z.coerce.number().min(0).optional(),
});

export const proposeBroadcastParamsSchema = z.object({
  audience: z.enum(["vip", "inactive", "manual"]).default("vip"),
  inactiveDays: z.coerce.number().int().min(7).max(365).default(30),
  name: z.string().trim().min(1).max(120).optional(),
  templateName: z.string().trim().min(1).max(120).optional(),
  templateLanguage: z.string().trim().min(2).max(15).default("en"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const confirmBroadcastSchema = z.object({
  proposalToken: z.string().trim().min(10),
  templateName: z.string().trim().min(1).max(120),
});

export interface AssistantActionResult {
  summary: string;
  data?: Record<string, unknown>;
  proposal?: {
    name: string;
    templateName?: string;
    templateLanguage: string;
    phones: string[];
    segment: string;
    audience: string;
    recipientCount: number;
    sample: { name: string | null; phone: string }[];
    proposalToken: string;
  };
}
