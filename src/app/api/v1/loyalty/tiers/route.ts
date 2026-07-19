import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyTiersUpdateBody } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/** GET /api/v1/loyalty/tiers — membership tier configuration. */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new LoyaltyController(ctx).listTiers(),
});

/** PUT /api/v1/loyalty/tiers — update membership tiers. */
export const PUT = defineRoute({
  auth: true,
  body: loyaltyTiersUpdateBody,
  handler: ({ ctx, body }) => new LoyaltyController(ctx).updateTiers(body.tiers),
});
