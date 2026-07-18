import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyParam } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/**
 * Loyalty module — /api/v1/loyalty/[customerId]
 *
 * A customer's loyalty/engagement standing, projected from the precomputed
 * `customer_analytics` RFM model (0036). Read-only: it reports the computed
 * state and never recomputes or double-credits reward grants. Tenancy is
 * derived from the authenticated session; a foreign customer id 404s.
 *
 * GET /api/v1/loyalty/:customerId → RFM + engagement standing
 */
export const GET = defineRoute({
  auth: true,
  params: loyaltyParam,
  handler: ({ ctx, params }) => new LoyaltyController(ctx).get(params.customerId),
});
