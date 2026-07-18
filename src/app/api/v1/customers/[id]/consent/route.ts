import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { customerIdParam, setConsentBody } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** POST /api/v1/customers/[id]/consent — record a consent change. */
export const POST = defineRoute({
  auth: true,
  params: customerIdParam,
  body: setConsentBody,
  handler: ({ ctx, params, body }) => new CustomerController(ctx).setConsent(params.id, body),
});
