import { defineRoute, NotImplementedError } from "@/server";
import { MarketingController } from "@/server/modules/marketing/controller";
import { listBroadcastsQuery } from "@/server/modules/marketing/validator";

export const runtime = "nodejs";

/**
 * Marketing module — /api/v1/marketing/broadcasts
 *
 * Outbound campaigns (WhatsApp via the EXISTING wacrm/WATI integration, plus
 * future email/SMS). This surface is READ-ONLY for now: it lists the broadcast
 * ledger EngageOS already keeps (whatsapp_broadcasts, 0027). Launching /
 * scheduling a send is intentionally NOT implemented here — that flow lives in
 * the existing WhatsApp composer (which reuses the wacrm outbound path and
 * enforces per-customer consent), and POST stays a 501 stub so this phase adds
 * no send automation and duplicates no send logic.
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
    // Consent-enforced send/scheduling is out of scope for this phase; the live
    // send path remains the WhatsApp composer. See module doc above.
    throw new NotImplementedError("marketing.broadcasts send is not implemented yet");
  },
});
