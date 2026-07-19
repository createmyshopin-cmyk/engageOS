import { defineRoute } from "@/server/http/handler";
import { LoyaltyController } from "@/server/modules/loyalty/controller";
import { loyaltyRulesUpdateBody } from "@/server/modules/loyalty/validator";

export const runtime = "nodejs";

/** GET /api/v1/loyalty/rules — merchant points earn rules. */
export const GET = defineRoute({
  auth: true,
  handler: ({ ctx }) => new LoyaltyController(ctx).listRules(),
});

/** PUT /api/v1/loyalty/rules — update points earn rules. */
export const PUT = defineRoute({
  auth: true,
  body: loyaltyRulesUpdateBody,
  handler: ({ ctx, body }) => new LoyaltyController(ctx).updateRules(body.rules),
});
