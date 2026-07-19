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
  couponFilter: z.enum(["all", "with_coupon", "without_coupon"]).optional(),
  stockFilter: z.enum(["all", "in_stock", "low_stock", "out_of_stock"]).optional(),
  newFilter: z.enum(["all", "new"]).optional(),
  sort: z
    .enum([
      "coupon_first",
      "newest",
      "oldest",
      "stock_first",
      "price_low",
      "price_high",
      "name_az",
      "name_za",
    ])
    .optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

/** Route param for /products/[id]/… */
export const productIdParam = z.object({
  id: z.string().uuid(),
});
export type ProductIdParam = z.infer<typeof productIdParam>;
