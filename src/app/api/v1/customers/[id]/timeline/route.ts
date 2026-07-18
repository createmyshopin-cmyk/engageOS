import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { customerIdParam, timelineQuery } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** GET /api/v1/customers/[id]/timeline — unified funnel + event timeline. */
export const GET = defineRoute({
  auth: true,
  params: customerIdParam,
  query: timelineQuery,
  handler: ({ ctx, params, query }) => new CustomerController(ctx).timeline(params.id, query),
});
