import "server-only";
import { ValidationError } from "@/server/core/errors";
import type { PageInfo } from "@/server/http/responses";

export type ProductSort =
  | "coupon_first"
  | "newest"
  | "oldest"
  | "stock_first"
  | "price_low"
  | "price_high"
  | "name_az"
  | "name_za";

export const DEFAULT_PRODUCT_SORT: ProductSort = "coupon_first";

export interface ProductSortableRow {
  id: string;
  created_at: string;
  stockTier: number;
  price: number | null;
  title: string | null;
  /** 0 = has coupon redemptions, 1 = none (for coupon_first sort). */
  couponTier: number;
  couponRedemptionCount: number;
}

export interface ProductListCursor {
  sort: ProductSort;
  k1: string;
  k2: string;
  id: string;
}

const CURSOR_VERSION = "pl2";

type SortKey = keyof ProductSortableRow | "id";

interface SortField {
  key: SortKey;
  dir: "asc" | "desc";
  nulls: "first" | "last";
}

const SORT_SPECS: Record<ProductSort, SortField[]> = {
  coupon_first: [
    { key: "couponTier", dir: "asc", nulls: "last" },
    { key: "couponRedemptionCount", dir: "desc", nulls: "last" },
    { key: "created_at", dir: "desc", nulls: "last" },
    { key: "id", dir: "desc", nulls: "last" },
  ],
  newest: [
    { key: "created_at", dir: "desc", nulls: "last" },
    { key: "id", dir: "desc", nulls: "last" },
  ],
  oldest: [
    { key: "created_at", dir: "asc", nulls: "last" },
    { key: "id", dir: "asc", nulls: "last" },
  ],
  stock_first: [
    { key: "stockTier", dir: "asc", nulls: "last" },
    { key: "created_at", dir: "desc", nulls: "last" },
    { key: "id", dir: "desc", nulls: "last" },
  ],
  price_low: [
    { key: "price", dir: "asc", nulls: "last" },
    { key: "id", dir: "asc", nulls: "last" },
  ],
  price_high: [
    { key: "price", dir: "desc", nulls: "last" },
    { key: "id", dir: "desc", nulls: "last" },
  ],
  name_az: [
    { key: "title", dir: "asc", nulls: "last" },
    { key: "id", dir: "asc", nulls: "last" },
  ],
  name_za: [
    { key: "title", dir: "desc", nulls: "last" },
    { key: "id", dir: "desc", nulls: "last" },
  ],
};

function fieldValue(row: ProductSortableRow, key: SortKey): string | number | null {
  if (key === "id") return row.id;
  return row[key];
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: "asc" | "desc",
  nulls: "first" | "last"
): number {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return nulls === "first" ? -1 : 1;
  if (bNull) return nulls === "first" ? 1 : -1;

  let cmp = 0;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? cmp : -cmp;
}

export function compareProductRows(
  a: ProductSortableRow,
  b: ProductSortableRow,
  sort: ProductSort
): number {
  const spec = SORT_SPECS[sort];
  for (const field of spec) {
    const cmp = compareValues(
      fieldValue(a, field.key),
      fieldValue(b, field.key),
      field.dir,
      field.nulls
    );
    if (cmp !== 0) return cmp;
  }
  return 0;
}

export function sortProductRows<T extends ProductSortableRow>(rows: T[], sort: ProductSort): T[] {
  return [...rows].sort((a, b) => compareProductRows(a, b, sort));
}

function cursorKeys(row: ProductSortableRow, sort: ProductSort): { k1: string; k2: string } {
  if (sort === "coupon_first") {
    return {
      k1: String(row.couponTier),
      k2: `${row.couponRedemptionCount}|${row.created_at}`,
    };
  }
  const spec = SORT_SPECS[sort];
  const k1 = String(fieldValue(row, spec[0]!.key) ?? "");
  const k2 = spec[1] ? String(fieldValue(row, spec[1]!.key) ?? "") : "";
  return { k1, k2 };
}

function reconstructCursorRow(cursor: ProductListCursor): ProductSortableRow {
  const base: ProductSortableRow = {
    id: cursor.id,
    created_at: "1970-01-01T00:00:00.000Z",
    stockTier: 0,
    price: null,
    title: null,
    couponTier: 1,
    couponRedemptionCount: 0,
  };
  switch (cursor.sort) {
    case "coupon_first": {
      const [count, ts] = cursor.k2.includes("|") ? cursor.k2.split("|") : ["0", cursor.k2];
      return {
        ...base,
        couponTier: Number(cursor.k1),
        couponRedemptionCount: Number(count) || 0,
        created_at: ts || base.created_at,
      };
    }
    case "newest":
    case "oldest":
      return { ...base, created_at: cursor.k1 };
    case "stock_first":
      return { ...base, stockTier: Number(cursor.k1), created_at: cursor.k2 };
    case "price_low":
    case "price_high":
      return { ...base, price: cursor.k1 === "" ? null : Number(cursor.k1) };
    case "name_az":
    case "name_za":
      return { ...base, title: cursor.k1 || null };
    default:
      return base;
  }
}

/** True when `row` appears strictly after `cursor` in the sorted list. */
export function isAfterProductCursor(
  row: ProductSortableRow,
  cursor: ProductListCursor
): boolean {
  return compareProductRows(row, reconstructCursorRow(cursor), cursor.sort) > 0;
}

export function encodeProductListCursor(cursor: ProductListCursor): string {
  const raw = `${CURSOR_VERSION}\0${cursor.sort}\0${cursor.k1}\0${cursor.k2}\0${cursor.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeProductListCursor(token: string, expectedSort?: ProductSort): ProductListCursor {
  let raw: string;
  try {
    raw = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new ValidationError("Invalid cursor");
  }
  const [version, sort, k1, k2, id] = raw.split("\0");
  if (version !== CURSOR_VERSION || !sort || k1 === undefined || k2 === undefined || !id) {
    throw new ValidationError("Invalid cursor");
  }
  if (!isProductSort(sort)) throw new ValidationError("Invalid cursor");
  if (expectedSort && sort !== expectedSort) throw new ValidationError("Invalid cursor");
  return { sort, k1, k2, id };
}

export function isProductSort(value: string): value is ProductSort {
  return (
    value === "coupon_first" ||
    value === "newest" ||
    value === "oldest" ||
    value === "stock_first" ||
    value === "price_low" ||
    value === "price_high" ||
    value === "name_az" ||
    value === "name_za"
  );
}

export function buildProductListPage<T extends ProductSortableRow>(
  rows: T[],
  limit: number,
  sort: ProductSort
): { items: T[]; page: PageInfo } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const keys = last ? cursorKeys(last, sort) : { k1: "", k2: "" };
  return {
    items,
    page: {
      nextCursor:
        hasMore && last
          ? encodeProductListCursor({ sort, k1: keys.k1, k2: keys.k2, id: last.id })
          : null,
      hasMore,
      limit,
    },
  };
}

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  coupon_first: "Coupon products first",
  newest: "Newest first",
  oldest: "Oldest first",
  stock_first: "In stock first",
  price_low: "Price: low to high",
  price_high: "Price: high to low",
  name_az: "Name: A → Z",
  name_za: "Name: Z → A",
};
