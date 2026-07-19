import "server-only";
import { ValidationError } from "@/server/core/errors";
import type { PageInfo } from "@/server/http/responses";
import { stockSortTier } from "@/server/modules/products/stock";

/**
 * Keyset cursor for product lists sorted in-stock first:
 * (stockTier ASC, created_at DESC, id DESC).
 */
export interface ProductStockCursor {
  stockTier: number;
  ts: string;
  id: string;
}

const CURSOR_VERSION = "ps1";

export function encodeProductStockCursor(cursor: ProductStockCursor): string {
  const raw = `${CURSOR_VERSION}\0${cursor.stockTier}\0${cursor.ts}\0${cursor.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeProductStockCursor(token: string): ProductStockCursor {
  let raw: string;
  try {
    raw = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new ValidationError("Invalid cursor");
  }
  const [version, tierStr, ts, id] = raw.split("\0");
  if (version !== CURSOR_VERSION || !tierStr || !ts || !id) {
    throw new ValidationError("Invalid cursor");
  }
  const stockTier = Number(tierStr);
  if (!Number.isInteger(stockTier) || Number.isNaN(Date.parse(ts))) {
    throw new ValidationError("Invalid cursor");
  }
  return { stockTier, ts, id };
}

export interface StockSortableRow {
  id: string;
  created_at: string;
  stockTier: number;
}

/** True when `row` sorts strictly after `cursor` in the stock-first order. */
export function isAfterStockCursor(row: StockSortableRow, cursor: ProductStockCursor): boolean {
  if (row.stockTier > cursor.stockTier) return true;
  if (row.stockTier < cursor.stockTier) return false;
  if (row.created_at < cursor.ts) return true;
  if (row.created_at > cursor.ts) return false;
  return row.id < cursor.id;
}

export function sortRowsStockFirst<T extends StockSortableRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.stockTier !== b.stockTier) return a.stockTier - b.stockTier;
    if (a.created_at !== b.created_at) return a.created_at > b.created_at ? -1 : 1;
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });
}

export function buildStockPage<T extends StockSortableRow>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => ProductStockCursor
): { items: T[]; page: PageInfo } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    page: {
      nextCursor: hasMore && last ? encodeProductStockCursor(toCursor(last)) : null,
      hasMore,
      limit,
    },
  };
}
