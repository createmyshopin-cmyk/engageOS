import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type {
  CustomerAnalyticsRow,
  CustomerWalletRow,
  LoyaltyLeaderboardRow,
  LoyaltyOverviewRow,
  MembershipTierRow,
  PointsRuleRow,
  PointsTransactionRow,
} from "@/server/modules/loyalty/dto";

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

  /** Business-wide loyalty dashboard KPIs. */
  async overview(): Promise<LoyaltyOverviewRow | null> {
    return this.rpcOne<LoyaltyOverviewRow>("loyalty_overview", {
      p_business_id: this.businessId,
    });
  }

  /** Top paying customers ranked by total_spend. */
  async leaderboard(limit: number, offset: number): Promise<LoyaltyLeaderboardRow[]> {
    return this.rpcRows<LoyaltyLeaderboardRow>("loyalty_leaderboard", {
      p_business_id: this.businessId,
      p_limit: limit,
      p_offset: offset,
    });
  }

  /** Wallet snapshot for a customer. */
  async wallet(customerId: string): Promise<CustomerWalletRow | null> {
    return this.rpcOne<CustomerWalletRow>("get_customer_wallet", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
    });
  }

  /** Paginated points ledger for a customer. */
  async pointsHistory(
    customerId: string,
    limit: number,
    offset: number
  ): Promise<PointsTransactionRow[]> {
    return this.rpcRows<PointsTransactionRow>("get_points_history", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
      p_limit: limit,
      p_offset: offset,
    });
  }

  /** Record a manual points adjustment (earn or deduct). */
  async adjustPoints(opts: {
    customerId: string;
    delta: number;
    note: string | null;
    actorId: string;
  }): Promise<string | null> {
    return this.tenant.rpcScalar<string>("record_points_transaction", {
      p_business_id: this.businessId,
      p_customer_id: opts.customerId,
      p_txn_type: "adjust",
      p_source: "manual",
      p_delta: opts.delta,
      p_dedup_key: null,
      p_metadata: {},
      p_campaign_id: null,
      p_order_id: null,
      p_play_id: null,
      p_note: opts.note,
      p_created_by: opts.actorId,
    });
  }

  async listPointsRules(): Promise<PointsRuleRow[]> {
    return this.rpcRows<PointsRuleRow>("merchant_list_points_rules", {
      p_business_id: this.businessId,
    });
  }

  async updatePointsRules(rules: Record<string, unknown>[]): Promise<void> {
    await this.tenant.callRpc("merchant_update_points_rules", {
      p_business_id: this.businessId,
      p_rules: rules,
    });
  }

  async listMembershipTiers(): Promise<MembershipTierRow[]> {
    return this.rpcRows<MembershipTierRow>("merchant_list_membership_tiers", {
      p_business_id: this.businessId,
    });
  }

  async updateMembershipTiers(tiers: Record<string, unknown>[]): Promise<void> {
    await this.tenant.callRpc("merchant_update_membership_tiers", {
      p_business_id: this.businessId,
      p_tiers: tiers,
    });
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
