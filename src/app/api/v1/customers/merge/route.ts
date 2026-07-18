import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { mergeCustomersBody } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** POST /api/v1/customers/merge — merge a duplicate into a survivor. */
export const POST = defineRoute({
  auth: true,
  body: mergeCustomersBody,
  handler: ({ ctx, body }) => new CustomerController(ctx).merge(body),
});
