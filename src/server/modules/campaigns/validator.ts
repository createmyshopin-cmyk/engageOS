import { z } from "zod";

/**
 * Validators for the campaigns module. business_id is never accepted — it is
 * derived from the authenticated principal. The list is keyset-paginated over
 * (created_at, id); an optional status filter narrows to one lifecycle state.
 */

/** Campaign lifecycle states as stored in the DB (0001 CHECK constraint). */
export const CAMPAIGN_STATUSES = ["draft", "active", "ended"] as const;

/** Query for GET /api/v1/campaigns (list). */
export const listCampaignsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuery>;
