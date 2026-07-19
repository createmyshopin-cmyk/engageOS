import { defineRoute } from "@/server/http/handler";
import { GoogleSheetsExportController } from "@/server/modules/google-sheets/controller";
import { sheetsExportQuery } from "@/server/modules/google-sheets/validator";

export const runtime = "nodejs";

/** GET /api/v1/integrations/google-sheets/export — unified feed export for Apps Script. */
export const GET = defineRoute({
  auth: true,
  query: sheetsExportQuery,
  handler: ({ ctx, query }) => new GoogleSheetsExportController(ctx).export(query),
});
