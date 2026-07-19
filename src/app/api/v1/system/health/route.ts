import { defineRoute } from "@/server";
import { UnauthorizedError } from "@/server/core/errors";
import { tenantRepositoryFor } from "@/server/http/context";

/**
 * System health — GET /api/v1/system/health
 *
 * Lightweight tenant-scoped health check for production monitoring:
 * confirms the session resolves to a valid business row in the database.
 * Does not expose cross-tenant data.
 */
export const GET = defineRoute({
  auth: true,
  handler: async ({ ctx }) => {
    const principal = ctx.principal;
    if (!principal) throw new UnauthorizedError();

    const tenant = tenantRepositoryFor(principal);
    const business = await tenant.getBusiness<{ id: string; name: string; active: boolean }>(
      "id, name, active"
    );

    if (!business) {
      return {
        status: "degraded" as const,
        tenant: {
          businessId: principal.businessId,
          resolved: false,
        },
        database: "business_not_found",
      };
    }

    return {
      status: business.active ? ("ok" as const) : ("inactive" as const),
      tenant: {
        businessId: business.id,
        name: business.name,
        active: business.active,
        resolved: true,
      },
      database: "ok" as const,
    };
  },
});
