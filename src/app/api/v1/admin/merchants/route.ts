import { defineRoute, NotImplementedError } from "@/server";

/**
 * Admin module — /api/v1/admin
 *
 * SCAFFOLD. CROSS-TENANT surface for platform operators only. Unlike every
 * other module, admin routes are NOT scoped to a single business — they are
 * gated by an ADMIN principal (principal.kind === "admin"), resolved from the
 * separate admin session. A merchant/staff principal must be rejected here.
 *
 * This is the ONLY place business_id may be supplied as input, and only after
 * the admin principal + scope check passes.
 *
 * Planned surface:
 *   GET /api/v1/admin/merchants               → list all merchants (cursor)
 *   GET /api/v1/admin/merchants/:id           → one merchant's profile + health
 *   GET /api/v1/admin/webhooks                → recent webhook deliveries (all shops)
 *   GET /api/v1/admin/metrics                 → platform-wide metrics
 *
 * Every admin action is audited with the operator's actorId.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("admin.merchants is not implemented yet");
  },
});
