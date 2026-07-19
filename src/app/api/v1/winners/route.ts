import { defineRoute } from "@/server/http/handler";
import { WinnersController } from "@/server/modules/winners/controller";
import { listWinnersQuery } from "@/server/modules/winners/validator";

export const runtime = "nodejs";

/** GET /api/v1/winners — paginated, filterable winners list. */
export const GET = defineRoute({
  auth: true,
  query: listWinnersQuery,
  handler: ({ ctx, query }) => new WinnersController(ctx).list(query),
});
