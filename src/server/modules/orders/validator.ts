import { z } from "zod";

/**
 * Zod validators for the orders read module. business_id is NEVER accepted here
 * — it's derived from the authenticated principal. Orders are written only by
 * ingestion; this surface is read + filter only.
 */

export const ORDER_FINANCIAL_STATUSES = [
  "paid",
  "pending",
  "refunded",
  "partially_refunded",
  "voided",
] as const;

/** Query params for GET /orders (list). */
export const listOrdersQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(ORDER_FINANCIAL_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;
