import { defineRoute, NotImplementedError } from "@/server";
import { CampaignController } from "@/server/modules/campaigns/controller";
import { listCampaignsQuery } from "@/server/modules/campaigns/validator";

export const runtime = "nodejs";

/**
 * Campaigns module — /api/v1/campaigns
 *
 * A read/manage facade over the EXISTING campaign engine (play_campaign,
 * campaign_display RPCs) — it must NOT reimplement play logic. The list wraps
 * the tenant campaign table + the event-sourced `campaign_stats_for_business`
 * rollup; the play/scratch/coupon/reward engines stay authoritative.
 *
 * GET  /api/v1/campaigns   → keyset list with per-campaign stats (read scope)
 * POST /api/v1/campaigns   → create — not yet implemented (campaign authoring
 *                            still flows through the existing /m/campaigns/new
 *                            server action; a v1 create is future work).
 */
export const GET = defineRoute({
  auth: true,
  query: listCampaignsQuery,
  handler: ({ ctx, query }) => new CampaignController(ctx).list(query),
});

export const POST = defineRoute({
  handler: async () => {
    throw new NotImplementedError("campaigns.create is not implemented yet");
  },
});
