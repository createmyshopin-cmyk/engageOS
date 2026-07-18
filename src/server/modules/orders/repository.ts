import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { OrderListRow } from "@/server/modules/orders/dto";

/**
 * OrderRepository — tenant-scoped order reads. The list uses the auto-scoped
 * select builder with keyset pagination over (placed_at, id) — the natural,
 * indexed order (orders_business_time_idx). The customer name is pulled via an
 * embedded to-one select so the list needs no second query. Read-only: this
 * repository never writes to orders (ingestion owns writes).
 */

// Embedded customers(name) resolves the FK in one round trip; !inner is NOT
// used so orders with a null customer_id (guest / unmatched) still appear.
const LIST_COLUMNS =
  "id, order_number, source, financial_status, fulfillment_status, currency, " +
  "total_price, customer_id, customer_phone, placed_at, customers(name)";

export class OrderRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /**
   * Keyset-paginated order list, newest-first by (placed_at, id). Fetches
   * limit + 1 to detect a further page. Optional financial-status and
   * customer-id filters (both tenant-scoped by construction).
   */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    customerId: string | null;
  }): Promise<OrderListRow[]> {
    let q = this.tenant.select("orders", LIST_COLUMNS);

    if (opts.status) q = q.eq("financial_status", opts.status);
    if (opts.customerId) q = q.eq("customer_id", opts.customerId);

    // Keyset: newest-first, next page is rows strictly "before" the cursor
    // tuple, tie-broken on id (same idiom as the customers/campaigns lists).
    if (opts.cursor) {
      q = q.or(
        `placed_at.lt.${opts.cursor.ts},and(placed_at.eq.${opts.cursor.ts},id.lt.${opts.cursor.id})`
      );
    }

    q = q
      .order("placed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(opts.limit + 1);

    const { data, error } = await q;
    if (error) throw new Error(`orders.list failed: ${error.message}`);
    return (data ?? []) as unknown as OrderListRow[];
  }
}
