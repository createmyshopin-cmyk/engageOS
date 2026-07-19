import { defineRoute } from "@/server/http/handler";
import { WinnersController } from "@/server/modules/winners/controller";
import { winnersSummaryQuery } from "@/server/modules/winners/validator";

export const runtime = "nodejs";

/** GET /api/v1/winners/summary — KPI cards for the winners page. */
export const GET = defineRoute({
  auth: true,
  query: winnersSummaryQuery,
  handler: ({ ctx, query }) => new WinnersController(ctx).summary(query),
});
