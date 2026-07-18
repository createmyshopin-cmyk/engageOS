import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { listCustomersQuery, upsertCustomerBody } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** GET /api/v1/customers — keyset-paginated, searchable list. */
export const GET = defineRoute({
  auth: true,
  query: listCustomersQuery,
  handler: ({ ctx, query }) => new CustomerController(ctx).list(query),
});

/** POST /api/v1/customers — upsert a customer by phone. */
export const POST = defineRoute({
  auth: true,
  body: upsertCustomerBody,
  handler: ({ ctx, body }) => new CustomerController(ctx).upsert(body),
});
