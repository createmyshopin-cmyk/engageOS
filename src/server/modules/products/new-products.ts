import "server-only";

/** Products synced within this window are treated as "new". */
export const NEW_PRODUCT_DAYS = 30;

export function isNewProduct(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - NEW_PRODUCT_DAYS);
  return created >= cutoff;
}

export type ProductNewFilter = "all" | "new";
