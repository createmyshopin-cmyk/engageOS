import { defineRoute } from "@/server/http/handler";
import { GoogleSheetsExportController } from "@/server/modules/google-sheets/controller";
import { sheetsCustomersQuery } from "@/server/modules/google-sheets/validator";

export const runtime = "nodejs";

/** GET /api/v1/integrations/google-sheets/customers — paginated JSON for Sheets sync. */
export const GET = defineRoute({
  auth: true,
  query: sheetsCustomersQuery,
  handler: ({ ctx, query }) => new GoogleSheetsExportController(ctx).customers(query),
});
