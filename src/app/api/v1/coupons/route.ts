import { defineRoute, NotImplementedError } from "@/server";

/**
 * Coupons module — /api/v1/coupons
 *
 * SCAFFOLD. Facade over the EXISTING coupon engine (redeem_coupon RPC and the
 * coupons table). Issuance + redemption logic stays in the engine; this API
 * lists, inspects, and triggers redemption through the sanctioned RPC.
 *
 * Tenancy: scoped by business_id. Redemption enforces the "redeem" scope so a
 * staff principal can redeem but not mint.
 *
 * Planned surface:
 *   GET  /api/v1/coupons                  → list (cursor, filter by status)
 *   GET  /api/v1/coupons/:code            → inspect one
 *   POST /api/v1/coupons/:code/redeem     → redeem via redeem_coupon (redeem scope)
 *
 * NEVER bypass redeem_coupon — it holds the atomic single-use guarantee.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("coupons.list is not implemented yet");
  },
});
