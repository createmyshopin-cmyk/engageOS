import { z } from "zod";

/**
 * Zod validator for the loyalty module. business_id is NEVER accepted — it's
 * derived from the authenticated principal. The customer id is the only input.
 */
export const loyaltyParam = z.object({
  customerId: z.string().uuid("Invalid customer id"),
});
export type LoyaltyParam = z.infer<typeof loyaltyParam>;
