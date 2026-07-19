import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireScope } from "@/server/auth/guard";
import {
  samplePayloadForEvent,
  ZAPIER_EVENTS,
  type ZapierEvent,
} from "@/lib/zapier/events";
import { findRecentEventForSample } from "@/lib/zapier/store";

export const runtime = "nodejs";

const sampleQuery = z.object({
  event: z.enum(ZAPIER_EVENTS),
});

/** GET /api/v1/integrations/zapier/hooks/sample — sample payload for Zapier field mapping. */
export const GET = defineRoute({
  auth: true,
  query: sampleQuery,
  handler: async ({ ctx, query }) => {
    requireScope(ctx.principal!, "read");
    const event = query.event as ZapierEvent;
    const recent = await findRecentEventForSample(ctx.principal!.businessId, event);
    const data = recent ?? samplePayloadForEvent(event);
    return {
      id: "00000000-0000-4000-8000-000000000099",
      event,
      occurred_at: new Date().toISOString(),
      business_id: ctx.principal!.businessId,
      data,
    };
  },
});
