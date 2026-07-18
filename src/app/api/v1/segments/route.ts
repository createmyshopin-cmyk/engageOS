import { defineRoute, NotImplementedError } from "@/server";

/**
 * Segments module — /api/v1/segments
 *
 * SCAFFOLD. Customer segmentation — saved definitions (rule trees over profile
 * fields + event aggregates) and their materialized membership. Designed to
 * scale to 10M+ customers, so membership is computed by a DB-side RPC / async
 * job, never by loading customers into the app tier.
 *
 * Tenancy: scoped by business_id.
 *
 * Planned surface:
 *   GET  /api/v1/segments                    → list definitions
 *   POST /api/v1/segments                    → create definition (write scope)
 *   GET  /api/v1/segments/:id/members        → membership (cursor-paginated)
 *   GET  /api/v1/segments/:id/count          → size estimate
 *
 * Consumed by /marketing to target campaigns and by analytics for cohorts.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("segments.list is not implemented yet");
  },
});

export const POST = defineRoute({
  handler: async () => {
    throw new NotImplementedError("segments.create is not implemented yet");
  },
});
