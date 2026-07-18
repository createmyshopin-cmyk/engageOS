import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { customerIdParam } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** GET /api/v1/customers/[id] — full profile. */
export const GET = defineRoute({
  auth: true,
  params: customerIdParam,
  handler: ({ ctx, params }) => new CustomerController(ctx).get(params.id),
});

/** DELETE /api/v1/customers/[id] — soft delete. */
export const DELETE = defineRoute({
  auth: true,
  params: customerIdParam,
  handler: ({ ctx, params }) => new CustomerController(ctx).remove(params.id),
});
