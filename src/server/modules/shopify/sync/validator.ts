import { z } from "zod";
import { SYNC_RESOURCES } from "@/lib/shopify/types";

/**
 * Zod validators for the Shopify sync control surface. business_id is NEVER
 * accepted here — it is derived from the authenticated principal. This surface
 * only lets a merchant OBSERVE sync state and TRIGGER (manual/selective) syncs;
 * the OAuth token exchange and webhook ingestion live on their own routes.
 */

/** The resources a merchant may selectively trigger (mirrors the DB check). */
export const syncResource = z.enum(
  SYNC_RESOURCES as unknown as [string, ...string[]]
);

/**
 * Body for POST /shopify/sync — trigger a manual or incremental sync.
 *   - `resources` omitted → sync every resource (full fan-out).
 *   - `resources: [...]` → selective/partial sync of just those resources.
 *   - `mode` defaults to "manual" (a fresh pull); "incremental" resumes from
 *     the stored per-resource watermark.
 */
export const triggerSyncBody = z.object({
  resources: z.array(syncResource).min(1).max(SYNC_RESOURCES.length).optional(),
  mode: z.enum(["manual", "incremental"]).optional(),
});
export type TriggerSyncBody = z.infer<typeof triggerSyncBody>;

/** Query for GET /shopify/sync/jobs — recent sync-job history (logs). */
export const listSyncJobsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListSyncJobsQuery = z.infer<typeof listSyncJobsQuery>;
