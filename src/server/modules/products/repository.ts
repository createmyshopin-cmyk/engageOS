import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { ProductListRow } from "@/server/modules/products/dto";

/**
 * ProductRepository — tenant-scoped catalog reads over shopify_products. The
 * list uses the auto-scoped select builder with keyset pagination over
 * (created_at, id) and an optional case-insensitive title/handle search.
 * Read-only: ingestion owns writes.
 */

const LIST_COLUMNS =
  "id, title, handle, product_type, vendor, status, price, image_url, created_at";

export class ProductRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    search: string | null;
    status: string | null;
  }): Promise<ProductListRow[]> {
    let q = this.tenant.select("shopify_products", LIST_COLUMNS);

    if (opts.status) q = q.eq("status", opts.status);
    if (opts.search) {
      const term = `%${opts.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      q = q.or(`title.ilike.${term},handle.ilike.${term},vendor.ilike.${term}`);
    }

    if (opts.cursor) {
      q = q.or(
        `created_at.lt.${opts.cursor.ts},and(created_at.eq.${opts.cursor.ts},id.lt.${opts.cursor.id})`
      );
    }

    q = q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(opts.limit + 1);

    const { data, error } = await q;
    if (error) throw new Error(`products.list failed: ${error.message}`);
    return (data ?? []) as unknown as ProductListRow[];
  }
}
