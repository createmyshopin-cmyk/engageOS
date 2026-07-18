import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { customerIdParam } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** GET /api/v1/customers/[id]/360 — the customer-360 bundle. */
export const GET = defineRoute({
  auth: true,
  params: customerIdParam,
  handler: ({ ctx, params }) => new CustomerController(ctx).get360(params.id),
});
