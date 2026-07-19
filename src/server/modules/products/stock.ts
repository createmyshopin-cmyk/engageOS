import "server-only";

/** Merchant-facing stock bucket for a catalog product. */
export type ProductStockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

const LOW_STOCK_THRESHOLD = 5;

export interface ProductStockInfo {
  status: ProductStockStatus;
  available: number | null;
}

/** Sort tier: lower = shown first (in-stock products at the top). */
export function stockSortTier(status: ProductStockStatus): number {
  switch (status) {
    case "in_stock":
      return 0;
    case "low_stock":
      return 1;
    case "out_of_stock":
      return 2;
    case "unknown":
      return 3;
  }
}

export function deriveStockInfo(available: number | null): ProductStockInfo {
  if (available === null) return { status: "unknown", available: null };
  if (available <= 0) return { status: "out_of_stock", available: 0 };
  if (available <= LOW_STOCK_THRESHOLD) return { status: "low_stock", available };
  return { status: "in_stock", available };
}

/** Parse Shopify quantity fields (often numbers, sometimes numeric strings). */
function parseQuantity(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Sum variant inventory_quantity from a synced Shopify product raw payload. */
export function stockFromProductRaw(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const variants = (raw as { variants?: unknown }).variants;
  if (!Array.isArray(variants) || variants.length === 0) return null;
  let total = 0;
  let hasQty = false;
  for (const v of variants) {
    if (!v || typeof v !== "object") continue;
    const qty = parseQuantity((v as { inventory_quantity?: unknown }).inventory_quantity);
    if (qty !== null) {
      total += qty;
      hasQty = true;
    }
  }
  return hasQty ? total : null;
}

/**
 * Map variant inventory_item_id → shopify_product_id from synced product raw payloads.
 * Inventory levels in Shopify only carry inventory_item_id, not product_id.
 */
export function inventoryItemToProductMap(
  products: Array<{ shopify_product_id: string; raw: unknown }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const product of products) {
    if (!product.raw || typeof product.raw !== "object") continue;
    const variants = (product.raw as { variants?: unknown }).variants;
    if (!Array.isArray(variants)) continue;
    for (const v of variants) {
      if (!v || typeof v !== "object") continue;
      const itemId = (v as { inventory_item_id?: unknown }).inventory_item_id;
      if (itemId !== null && itemId !== undefined && String(itemId).trim() !== "") {
        map.set(String(itemId), product.shopify_product_id);
      }
    }
  }
  return map;
}

export const STOCK_STATUS_LABELS: Record<ProductStockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  unknown: "Stock unknown",
};
