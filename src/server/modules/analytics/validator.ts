import { z } from "zod";

/** Query params for GET /api/v1/analytics/trends */
export const analyticsTrendsQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export type AnalyticsTrendsQuery = z.infer<typeof analyticsTrendsQuery>;
