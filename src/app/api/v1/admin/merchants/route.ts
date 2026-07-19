import { defineRoute, NotImplementedError } from "@/server";
import { isAdmin } from "@/lib/admin-session";
import { ForbiddenError } from "@/server/core/errors";

/**
 * Admin module — /api/v1/admin
 *
 * CROSS-TENANT surface for platform operators only. Gated by the separate
 * admin_session cookie — merchant principals must be rejected here even if
 * they are authenticated.
 */
export const GET = defineRoute({
  auth: false,
  handler: async () => {
    if (!(await isAdmin())) {
      throw new ForbiddenError("Admin access required");
    }
    throw new NotImplementedError("admin.merchants is not implemented yet");
  },
});
