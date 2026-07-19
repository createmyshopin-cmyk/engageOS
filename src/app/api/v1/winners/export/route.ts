import { defineRoute } from "@/server/http/handler";
import { WinnersController } from "@/server/modules/winners/controller";
import { exportWinnersQuery } from "@/server/modules/winners/validator";

export const runtime = "nodejs";

/** GET /api/v1/winners/export — CSV export with the same filters as the list. */
export const GET = defineRoute({
  auth: true,
  query: exportWinnersQuery,
  handler: ({ ctx, query }) => new WinnersController(ctx).exportWinners(query),
});
