import { defineRoute, NotImplementedError } from "@/server";

/**
 * Merchants module — /api/v1/merchants
 *
 * SCAFFOLD. The framework contract is fixed; only the service body is pending.
 *
 * Tenancy: a merchant principal may only read/update ITS OWN business. There is
 * no "list all merchants" here — that lives under /api/v1/admin with an admin
 * principal. business_id is always ctx.principal.businessId, never from input.
 *
 * Planned surface:
 *   GET   /api/v1/merchants/me            → current business profile + settings
 *   PATCH /api/v1/merchants/me            → update profile (owner/manager scope)
 *   GET   /api/v1/merchants/me/staff      → list staff (owner scope)
 *   POST  /api/v1/merchants/me/staff      → invite staff (owner scope)
 *
 * Backed by the existing merchants/staff tables + auth flow (extend, never
 * replace). Reuse getMerchantSession-derived principal; do not add a parallel
 * session mechanism.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("merchants.me is not implemented yet");
  },
});
