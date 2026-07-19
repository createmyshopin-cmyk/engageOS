import { defineRoute, NotImplementedError } from "@/server";
import { MarketingController } from "@/server/modules/marketing/controller";
import { listBroadcastsQuery } from "@/server/modules/marketing/validator";

export const runtime = "nodejs";

/**
 * Marketing module — /api/v1/marketing/broadcasts
 *
 * Outbound campaigns (WhatsApp via WATI, plus future email/SMS). This surface is
 * READ-ONLY for now. The Meta/wacrm broadcast ledger was removed; POST stays a
 * 501 stub until a WATI-backed feed is added.
 *
 * Tenancy: derived from the authenticated session; every query is keyset-
 * paginated over (created_at, id). business_id is never taken from input.
 *
 * GET  /api/v1/marketing/broadcasts → list sends (read scope)
 * POST /api/v1/marketing/broadcasts → not implemented (no automation yet)
 */
export const GET = defineRoute({
  auth: true,
  query: listBroadcastsQuery,
  handler: ({ ctx, query }) => new MarketingController(ctx).listBroadcasts(query),
});

export const POST = defineRoute({
  auth: true,
  handler: async () => {
    // Consent-enforced send/scheduling is out of scope for this phase; use WATI.
    throw new NotImplementedError("marketing.broadcasts send is not implemented yet");
  },
});
