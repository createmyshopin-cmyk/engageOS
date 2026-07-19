import { defineRoute } from "@/server/http/handler";
import { GoogleSheetsExportController } from "@/server/modules/google-sheets/controller";
import { sheetsCodesQuery } from "@/server/modules/google-sheets/validator";

export const runtime = "nodejs";

/** GET /api/v1/integrations/google-sheets/codes — paginated coupon/Shopify codes for Sheets sync. */
export const GET = defineRoute({
  auth: true,
  query: sheetsCodesQuery,
  handler: ({ ctx, query }) => new GoogleSheetsExportController(ctx).codes(query),
});
