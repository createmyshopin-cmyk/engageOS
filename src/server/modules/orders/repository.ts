import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { OrderDetailRow, OrderListRow } from "@/server/modules/orders/dto";
import type { OrderCouponFilter } from "@/server/modules/orders/validator";

/**
 * OrderRepository — tenant-scoped order reads. The list uses the auto-scoped
 * select builder with keyset pagination over (placed_at, id) — the natural,
 * indexed order (orders_business_time_idx). The customer name is pulled via an
 * embedded to-one select so the list needs no second query. Read-only: this
 * repository never writes to orders (ingestion owns writes).
 */

// Embedded customers(name) / campaigns(name) resolve FKs in one round trip.
const LIST_COLUMNS =
  "id, order_number, source, financial_status, fulfillment_status, currency, " +
  "total_price, total_discount, customer_id, customer_phone, placed_at, " +
  "discount_code, campaign_id, coupon_id, customers(name), campaigns(name)";

const DETAIL_COLUMNS =
  LIST_COLUMNS +
  ", subtotal, total_tax, order_items(id, title, sku, quantity, price, total_discount)";

export class OrderRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /**
   * Keyset-paginated order list, newest-first by (placed_at, id). Fetches
   * limit + 1 to detect a further page. Optional financial-status,
   * customer-id, and campaign-coupon filters (all tenant-scoped by construction).
   */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    customerId: string | null;
    couponFilter: OrderCouponFilter;
  }): Promise<OrderListRow[]> {
    let q = this.tenant.select("orders", LIST_COLUMNS);

    if (opts.status) q = q.eq("financial_status", opts.status);
    if (opts.customerId) q = q.eq("customer_id", opts.customerId);
    if (opts.couponFilter === "with_coupon") q = q.not("coupon_id", "is", null);

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

  /** Fetch one order with line items. Null when not found or out of tenant scope. */
  async findById(orderId: string): Promise<OrderDetailRow | null> {
    const { data, error } = await this.tenant
      .select("orders", DETAIL_COLUMNS)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(`orders.findById failed: ${error.message}`);
    return (data as unknown as OrderDetailRow | null) ?? null;
  }
}
