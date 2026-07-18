import { defineRoute, NotImplementedError } from "@/server";

/**
 * Loyalty module — /api/v1/loyalty
 *
 * SCAFFOLD. Points/tier balances and ledger for a customer. Balances are
 * derived from the universal event stream + loyalty rules; this API exposes
 * the computed state and the accrual/redemption ledger.
 *
 * Tenancy: scoped by business_id; a customer's balance is only visible to its
 * own tenant.
 *
 * Planned surface:
 *   GET  /api/v1/loyalty/:customerId            → balance + tier
 *   GET  /api/v1/loyalty/:customerId/ledger     → accrual/redemption history
 *   POST /api/v1/loyalty/:customerId/adjust     → manual adjust (owner scope, audited)
 *
 * Must reconcile with the reward engine — never double-credit points already
 * granted by a reward redemption.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("loyalty is not implemented yet");
  },
});
