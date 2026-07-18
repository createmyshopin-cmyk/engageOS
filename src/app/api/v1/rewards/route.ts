import { defineRoute, NotImplementedError } from "@/server";

/**
 * Rewards module — /api/v1/rewards
 *
 * SCAFFOLD. Facade over the EXISTING reward engine. Catalog + redemption of
 * rewards; the engine owns eligibility and fulfillment.
 *
 * Tenancy: scoped by business_id.
 *
 * Planned surface:
 *   GET  /api/v1/rewards                   → reward catalog (cursor)
 *   GET  /api/v1/rewards/:id               → detail
 *   POST /api/v1/rewards/:id/redeem        → redeem for a customer (redeem scope)
 *
 * Redemption must go through the reward engine's atomic path and reconcile with
 * loyalty points — never grant a reward without the engine's eligibility check.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("rewards.list is not implemented yet");
  },
});
