import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { customerIdParam, addTagBody } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** POST /api/v1/customers/[id]/tags — attach a tag. */
export const POST = defineRoute({
  auth: true,
  params: customerIdParam,
  body: addTagBody,
  handler: ({ ctx, params, body }) => new CustomerController(ctx).addTag(params.id, body),
});
