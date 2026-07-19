import { defineRoute } from "@/server/http/handler";
import { CustomerController } from "@/server/modules/customers/controller";
import { exportCustomersQuery } from "@/server/modules/customers/validator";

export const runtime = "nodejs";

/** GET /api/v1/customers/export — CSV or Excel export with the same filters as the list. */
export const GET = defineRoute({
  auth: true,
  query: exportCustomersQuery,
  handler: ({ ctx, query }) => new CustomerController(ctx).exportCustomers(query),
});
