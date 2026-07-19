import { defineRoute } from "@/server/http/handler";
import { ShopifySyncController } from "@/server/modules/shopify/sync/controller";
import { triggerSyncBody } from "@/server/modules/shopify/sync/validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Trigger enqueues fast and returns; the actual pull runs in `after()`, but we
// allow headroom for the enqueue fan-out + the first background slice to start.
export const maxDuration = 10;

/**
 * Shopify sync control — /api/v1/shopify/sync
 *
 * GET  → full sync dashboard bundle (connection health + per-resource state +
 *        recent jobs). Read scope.
 * POST → trigger a manual/incremental sync, full or selective. Enqueues jobs
 *        idempotently and drives them in the background (`after()`). Write scope.
 *
 * Tenancy is derived from the authenticated session; a merchant can only ever
 * observe or trigger syncs for their own connected store. The OAuth token and
 * webhook secret never touch this surface.
 */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new ShopifySyncController(ctx).overview(),
});

export const POST = defineRoute({
  auth: true,
  body: triggerSyncBody,
  handler: ({ ctx, body }) => new ShopifySyncController(ctx).trigger(body),
});
