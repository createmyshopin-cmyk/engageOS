import { defineRoute } from "@/server/http/handler";
import { ShopifySyncController } from "@/server/modules/shopify/sync/controller";
import { listSyncJobsQuery } from "@/server/modules/shopify/sync/validator";

export const runtime = "nodejs";

/**
 * Shopify sync jobs / logs — /api/v1/shopify/sync/jobs
 *
 * Recent sync-job history (newest first): resource, mode, status, progress,
 * failures, attempts, error, timing. Powers the "Recent Sync Jobs" panel and
 * per-job drill-down. Read scope; tenant derived from the session.
 */
export const GET = defineRoute({
  auth: true,
  query: listSyncJobsQuery,
  handler: ({ ctx, query }) => new ShopifySyncController(ctx).jobs(query),
});
