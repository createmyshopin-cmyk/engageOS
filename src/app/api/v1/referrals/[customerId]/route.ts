import { defineRoute, NotImplementedError } from "@/server";

/**
 * Referrals module — /api/v1/referrals
 *
 * SCAFFOLD. Referral program — a referrer shares a code/link, a referee
 * converts, both earn rewards. Attribution is recorded as universal events
 * (referral.shared, referral.converted) so it flows into timeline + analytics.
 *
 * Tenancy: scoped by business_id.
 *
 * Planned surface:
 *   GET  /api/v1/referrals/:customerId            → a customer's referral code + stats
 *   POST /api/v1/referrals/:customerId/code       → issue/rotate code (write scope)
 *   POST /api/v1/referrals/redeem                 → attribute a conversion (idempotent)
 *
 * Reward granting reuses the reward/coupon engines; referral redemption must be
 * idempotent (a referee converts once) via a dedup key on the event.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("referrals is not implemented yet");
  },
});
