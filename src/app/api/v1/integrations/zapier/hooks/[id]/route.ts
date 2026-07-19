import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireScope } from "@/server/auth/guard";
import { NotFoundError } from "@/server/core/errors";
import { deleteHookSubscription } from "@/lib/zapier/store";

export const runtime = "nodejs";

const hookIdParam = z.object({
  id: z.string().uuid(),
});

/** DELETE /api/v1/integrations/zapier/hooks/:id — Zapier REST Hook unsubscribe. */
export const DELETE = defineRoute({
  auth: true,
  params: hookIdParam,
  handler: async ({ ctx, params }) => {
    requireScope(ctx.principal!, "zapier:hooks");
    const deleted = await deleteHookSubscription(ctx.principal!.businessId, params.id);
    if (!deleted) throw new NotFoundError("Hook subscription not found");
    return { deleted: true };
  },
});
