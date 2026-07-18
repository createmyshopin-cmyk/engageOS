import { z } from "zod";

/**
 * Zod validators for the products read module. business_id is NEVER accepted
 * here — it's derived from the authenticated principal. Products are written
 * only by ingestion; this surface is read + search only.
 */

/** Query params for GET /products (list). */
export const listProductsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;
