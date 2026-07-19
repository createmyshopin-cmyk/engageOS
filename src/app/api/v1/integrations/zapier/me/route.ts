import { defineRoute } from "@/server/http/handler";
import { requireScope } from "@/server/auth/guard";
import { getBusinessName } from "@/lib/zapier/store";

export const runtime = "nodejs";

/** GET /api/v1/integrations/zapier/me — connection test for Zapier auth. */
export const GET = defineRoute({
  auth: true,
  handler: async ({ ctx }) => {
    requireScope(ctx.principal!, "read");
    const businessName = await getBusinessName(ctx.principal!.businessId);
    return {
      businessId: ctx.principal!.businessId,
      businessName: businessName ?? "EngageOS Business",
    };
  },
});
