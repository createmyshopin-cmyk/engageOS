import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { CustomerAnalyticsRow } from "@/server/modules/loyalty/dto";

/**
 * LoyaltyRepository — tenant-scoped reads of the precomputed customer analytics
 * standing. Read-only: it never writes to customer_analytics (the
 * `recompute_customer_analytics` RPC owns that) and never recomputes here.
 */

const COLUMNS =
  "customer_id, total_orders, total_spend, avg_order_value, total_plays, " +
  "total_wins, total_redemptions, recency_days, frequency, monetary, rfm_score, " +
  "health_score, clv, first_seen_at, last_seen_at, last_order_at, computed_at";

export class LoyaltyRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /** The precomputed analytics row for a customer, or null if none exists yet. */
  async byCustomer(customerId: string): Promise<CustomerAnalyticsRow | null> {
    const { data, error } = await this.tenant
      .select("customer_analytics", COLUMNS)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) throw new Error(`loyalty.byCustomer failed: ${error.message}`);
    return (data as unknown as CustomerAnalyticsRow | null) ?? null;
  }

  /** True if the customer exists within this tenant (not soft-deleted). */
  async customerExists(customerId: string): Promise<boolean> {
    const { data, error } = await this.tenant
      .select("customers", "id")
      .eq("id", customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`loyalty.customerExists failed: ${error.message}`);
    return data != null;
  }
}
