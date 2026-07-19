import { z } from "zod";
import { defineRoute } from "@/server/http/handler";
import { requireScope } from "@/server/auth/guard";
import { ForbiddenError } from "@/server/core/errors";
import { isDeliverableUrl } from "@/lib/security/ssrf";
import { ZAPIER_EVENTS } from "@/lib/zapier/events";
import { createHookSubscription } from "@/lib/zapier/store";

export const runtime = "nodejs";

const subscribeBody = z.object({
  hookUrl: z.string().trim().url("hookUrl must be a valid URL"),
  event: z.enum(ZAPIER_EVENTS),
});

/** POST /api/v1/integrations/zapier/hooks — Zapier REST Hook subscribe. */
export const POST = defineRoute({
  auth: true,
  body: subscribeBody,
  handler: async ({ ctx, body }) => {
    const principal = ctx.principal!;
    requireScope(principal, "zapier:hooks");

    let parsed: URL;
    try {
      parsed = new URL(body.hookUrl);
    } catch {
      throw new ForbiddenError("hookUrl must be a valid HTTPS URL");
    }
    if (parsed.protocol !== "https:") {
      throw new ForbiddenError("hookUrl must use HTTPS");
    }
    if (!(await isDeliverableUrl(body.hookUrl))) {
      throw new ForbiddenError("hookUrl must resolve to a public address");
    }

    const hook = await createHookSubscription(principal.businessId, body.hookUrl, body.event);
    return {
      id: hook.id,
      event: hook.event_name,
      hookUrl: hook.hook_url,
      createdAt: hook.created_at,
    };
  },
});
