import { z } from "zod";

/**
 * Zod validators for the marketing read module. business_id is NEVER accepted
 * here — it is derived from the authenticated principal. This surface lists the
 * broadcast ledger (read only); launching/scheduling sends is intentionally NOT
 * exposed here (that flow lives in the existing WhatsApp composer and remains a
 * 501 stub on POST — no send automation is added by this module).
 */

/** Query params for GET /marketing/broadcasts (list). */
export const listBroadcastsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListBroadcastsQuery = z.infer<typeof listBroadcastsQuery>;
