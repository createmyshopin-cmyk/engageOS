import { defineRoute } from "@/server";
import { UnauthorizedError } from "@/server/core/errors";

/**
 * Auth module — GET /api/v1/auth/session
 *
 * Read-only session introspection for API clients (dashboard, mobile,
 * automations). Returns the authenticated principal derived server-side —
 * businessId is NEVER read from the request.
 */
export const GET = defineRoute({
  auth: true,
  handler: async ({ ctx }) => {
    const principal = ctx.principal;
    if (!principal) throw new UnauthorizedError();

    return {
      kind: principal.kind,
      businessId: principal.businessId,
      actorId: principal.actorId,
      role: principal.role,
      scopes: [...principal.scopes],
      merchant: principal.session
        ? {
            name: principal.session.name,
            email: principal.session.email,
          }
        : null,
    };
  },
});
