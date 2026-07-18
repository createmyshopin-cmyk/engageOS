import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/db/rpc";
import { getMerchantSession } from "@/lib/merchant-session";
import type {
  CampaignActivitySummary,
  CampaignConversion,
  CampaignDailyActivityRow,
  CampaignEventActor,
  CampaignEventCount,
  CampaignEventType,
  CampaignPerformanceRow,
  CampaignTimelineEvent,
  CouponDropOverviewRow,
  CouponDropSampleCode,
  CouponDropStats,
  MerchantRole,
  MerchantSessionPayload,
  RecentCampaignEvent,
  TrafficSourceRow,
} from "@/lib/types";
import { slugify } from "@/lib/validation";

/** Map a merchant session role to a campaign_events actor_type. */
function actorTypeForRole(role: MerchantRole): CampaignEventActor {
  switch (role) {
    case "owner":
      return "merchant_owner";
    case "manager":
      return "merchant_manager";
    case "staff":
      return "merchant_staff";
  }
}

/**
 * Tenant Repository — the ONLY sanctioned data-access path for the merchant
 * portal. It binds every query to the authenticated session's business_id so
 * that no merchant-facing code ever filters by tenant manually (and therefore
 * can never forget to).
 *
 * Rules:
 *   - Tables that carry business_id (campaigns, customers, plays, coupons) are
 *     always filtered by the session tenant automatically.
 *   - prizes has no business_id — it is scoped through its parent campaign via
 *     an FK inner-join filter, so a foreign campaign_id returns nothing.
 *   - Inserts auto-inject business_id; updates/deletes are tenant-scoped.
 *   - The service-role client is never handed out; callers get pre-scoped
 *     builders only.
 */

/** Tables that own a business_id column and are auto-scoped. */
type TenantTable =
  | "campaigns"
  | "customers"
  | "plays"
  | "coupons"
  // Commerce domain (0038) — every row carries business_id NN, so the same
  // auto-scoping applies. Added for the v1 read models (orders/products/shopify).
  | "orders"
  | "order_items"
  | "shopify_products"
  | "shopify_shops"
  // CDP analytics (0036) — customer_analytics.business_id NN; loyalty read model.
  | "customer_analytics"
  // WhatsApp broadcast ledger (0027) — business_id NN. Read-only marketing feed.
  | "whatsapp_broadcasts";

export class TenantRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    readonly session: MerchantSessionPayload
  ) {}

  get businessId(): string {
    return this.session.businessId;
  }

  // ---------- Business (the tenant itself) ----------

  /** Fetch the current tenant's own business row (id == businessId). */
  async getBusiness<T = Record<string, unknown>>(
    columns: string
  ): Promise<T | null> {
    const { data, error } = await this.supabase
      .from("businesses")
      .select(columns)
      .eq("id", this.businessId)
      .maybeSingle();
    if (error) throw new Error(`getBusiness failed: ${error.message}`);
    return (data as T | null) ?? null;
  }

  // ---------- Generic scoped builders (business_id tables) ----------

  /**
   * SELECT builder pre-filtered to the tenant. Chain further `.eq`, `.order`,
   * `.limit`, `.maybeSingle`, counts, etc. business_id is already applied.
   */
  select(
    table: TenantTable,
    columns: string,
    opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }
  ) {
    return this.supabase
      .from(table)
      .select(columns, opts)
      .eq("business_id", this.businessId);
  }

  /** Count helper: returns row count for the tenant, with optional extra eq filters. */
  async count(
    table: TenantTable,
    filters: Record<string, string | number | boolean> = {}
  ): Promise<number> {
    let q = this.supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("business_id", this.businessId);
    for (const [col, val] of Object.entries(filters)) {
      q = q.eq(col, val);
    }
    const { count, error } = await q;
    if (error) throw new Error(`count(${table}) failed: ${error.message}`);
    return count ?? 0;
  }

  /** INSERT rows into a tenant table; business_id is injected automatically. */
  async insert<T = unknown>(
    table: TenantTable,
    rows: Record<string, unknown> | Record<string, unknown>[],
    returning?: string
  ): Promise<T | null> {
    const list = Array.isArray(rows) ? rows : [rows];
    const scoped = list.map((r) => ({ ...r, business_id: this.businessId }));
    let q = this.supabase.from(table).insert(scoped);
    if (returning) {
      const { data, error } = await q.select(returning);
      if (error) throw new Error(`insert(${table}) failed: ${error.message}`);
      return (data as T) ?? null;
    }
    const { error } = await q;
    if (error) throw new Error(`insert(${table}) failed: ${error.message}`);
    return null;
  }

  /** UPDATE a single row by id, scoped to the tenant. Returns rows affected. */
  async updateById(
    table: TenantTable,
    id: string,
    patch: Record<string, unknown>
  ): Promise<number> {
    const { error, count } = await this.supabase
      .from(table)
      .update(patch, { count: "exact" })
      .eq("id", id)
      .eq("business_id", this.businessId);
    if (error) throw new Error(`updateById(${table}) failed: ${error.message}`);
    return count ?? 0;
  }

  /** DELETE a single row by id, scoped to the tenant. Returns rows affected. */
  async deleteById(table: TenantTable, id: string): Promise<number> {
    const { error, count } = await this.supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("business_id", this.businessId);
    if (error) throw new Error(`deleteById(${table}) failed: ${error.message}`);
    return count ?? 0;
  }

  /**
   * Call a Postgres RPC function using the service-role client.
   * Throws if the RPC returns an error.
   */
  async callRpc(fn: string, args: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.rpc(fn, args);
    if (error) throw new Error(`rpc(${fn}) failed: ${error.message}`);
  }

  /**
   * Call a row-returning SECURITY DEFINER RPC and return the rows typed. Used
   * by the Enterprise API repository layer so domain repositories never touch
   * the raw client. Callers MUST still pass the tenant's business_id in `args`
   * (the RPC enforces tenant scoping server-side).
   */
  async rpcSelect<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await this.supabase.rpc(fn, args);
    if (error) throw new Error(`rpc(${fn}) failed: ${error.message}`);
    if (data == null) return [];
    return (Array.isArray(data) ? data : [data]) as T[];
  }

  /**
   * Call an RPC that returns a single scalar or JSON object (returns null when
   * the RPC yields no row). Thin wrapper over the scoped service-role client.
   */
  async rpcScalar<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    const { data, error } = await this.supabase.rpc(fn, args);
    if (error) throw new Error(`rpc(${fn}) failed: ${error.message}`);
    return (data as T | null) ?? null;
  }

  // ---------- Aggregate stats ----------

  /**
   * Per-campaign stats for the whole tenant in ONE round-trip (replaces the
   * per-campaign N+1 count fan-out). Scoped to this tenant's business_id.
   */
  async campaignStats(): Promise<
    Map<
      string,
      {
        plays: number;
        wins: number;
        redeemed: number;
        wa_sent: number;
        wa_failed: number;
        remaining_coupons: number;
      }
    >
  > {
    const { data, error } = await this.supabase.rpc(
      "campaign_stats_for_business",
      { p_business_id: this.businessId }
    );
    if (error) throw new Error(`campaignStats failed: ${error.message}`);
    const map = new Map<string, any>();
    for (const row of (data ?? []) as any[]) {
      map.set(row.campaign_id, {
        plays: Number(row.plays) || 0,
        wins: Number(row.wins) || 0,
        redeemed: Number(row.redeemed) || 0,
        wa_sent: Number(row.wa_sent) || 0,
        wa_failed: Number(row.wa_failed) || 0,
        remaining_coupons: Number(row.remaining_coupons) || 0,
      });
    }
    return map;
  }

  // ---------- Event-sourced analytics (Release V1, read-only) ----------
  //
  // Additive read models over the immutable customer_events log and prizes.
  // Each wraps a SECURITY DEFINER RPC and passes the session's business_id,
  // so merchant analytics read from events instead of recomputing ad hoc and
  // can never cross tenant boundaries.

  /** QR → Redemption funnel for one campaign, counted from the event log. */
  async campaignFunnel(campaignId: string): Promise<{
    scans: number;
    registrations: number;
    scratches: number;
    prizes_won: number;
    coupons: number;
    redemptions: number;
    return_visits: number;
  }> {
    const { data, error } = await this.supabase.rpc("campaign_funnel", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`campaignFunnel failed: ${error.message}`);
    const row = ((data ?? []) as any[])[0] ?? {};
    return {
      scans: Number(row.scans) || 0,
      registrations: Number(row.registrations) || 0,
      scratches: Number(row.scratches) || 0,
      prizes_won: Number(row.prizes_won) || 0,
      coupons: Number(row.coupons) || 0,
      redemptions: Number(row.redemptions) || 0,
      return_visits: Number(row.return_visits) || 0,
    };
  }

  /** Coupon Drop analytics — pool + issuance + redemption + attributed sales. */
  async couponDropStats(campaignId: string): Promise<CouponDropStats> {
    const { data, error } = await this.supabase.rpc("coupon_drop_stats", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`couponDropStats failed: ${error.message}`);
    const row = ((data ?? []) as any[])[0] ?? {};
    return {
      codes_minted: Number(row.codes_minted) || 0,
      codes_available: Number(row.codes_available) || 0,
      codes_claimed: Number(row.codes_claimed) || 0,
      codes_redeemed: Number(row.codes_redeemed) || 0,
      fallback_issued: Number(row.fallback_issued) || 0,
      orders_attributed: Number(row.orders_attributed) || 0,
      gross_sales_attributed: Number(row.gross_sales_attributed) || 0,
      avg_order_value: Number(row.avg_order_value) || 0,
      currency: (row.currency as string) || "INR",
    };
  }

  /** Per-campaign Coupon Drop pool overview for the merchant Shopify view. */
  async couponDropOverview(): Promise<CouponDropOverviewRow[]> {
    const { data, error } = await this.supabase.rpc("coupon_drop_campaign_overview", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`couponDropOverview failed: ${error.message}`);
    return ((data ?? []) as any[]).map((row) => ({
      campaign_id: String(row.campaign_id),
      campaign_name: (row.campaign_name as string) ?? "",
      campaign_status: (row.campaign_status as string) ?? "draft",
      pool_status: (row.pool_status as string) ?? "pending",
      pool_last_error: (row.pool_last_error as string) ?? null,
      shopify_parent_discount_id: (row.shopify_parent_discount_id as string) ?? null,
      currency: (row.currency as string) || "INR",
      codes_minted: Number(row.codes_minted) || 0,
      codes_available: Number(row.codes_available) || 0,
      codes_claimed: Number(row.codes_claimed) || 0,
      codes_redeemed: Number(row.codes_redeemed) || 0,
    }));
  }

  /** A few recent pool codes for one campaign (merchant inspection). */
  async couponDropSampleCodes(
    campaignId: string,
    limit = 5
  ): Promise<CouponDropSampleCode[]> {
    const { data, error } = await this.supabase.rpc("coupon_drop_sample_codes", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_limit: limit,
    });
    if (error) throw new Error(`couponDropSampleCodes failed: ${error.message}`);
    return ((data ?? []) as any[]).map((row) => ({
      code: (row.code as string) ?? "",
      status: (row.status as string) ?? "available",
      shopify_redeem_code_id: (row.shopify_redeem_code_id as string) ?? null,
      claimed_at: (row.claimed_at as string) ?? null,
      created_at: (row.created_at as string) ?? "",
    }));
  }

  /** Business-wide totals from the immutable event log (dashboard KPIs). */
  async businessEventTotals(): Promise<{
    customers: number;
    plays: number;
    wins: number;
    losses: number;
    coupons: number;
    redeemed: number;
    return_visits: number;
  }> {
    const { data, error } = await this.supabase.rpc("business_event_totals", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`businessEventTotals failed: ${error.message}`);
    const row = ((data ?? []) as any[])[0] ?? {};
    return {
      customers: Number(row.customers) || 0,
      plays: Number(row.plays) || 0,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      coupons: Number(row.coupons) || 0,
      redeemed: Number(row.redeemed) || 0,
      return_visits: Number(row.return_visits) || 0,
    };
  }

  /** One campaign's totals from the event log (campaign detail KPIs). */
  async campaignEventTotals(campaignId: string): Promise<{
    customers: number;
    plays: number;
    wins: number;
    losses: number;
    coupons: number;
    redeemed: number;
    return_visits: number;
  }> {
    const { data, error } = await this.supabase.rpc("campaign_event_totals", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`campaignEventTotals failed: ${error.message}`);
    const row = ((data ?? []) as any[])[0] ?? {};
    return {
      customers: Number(row.customers) || 0,
      plays: Number(row.plays) || 0,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      coupons: Number(row.coupons) || 0,
      redeemed: Number(row.redeemed) || 0,
      return_visits: Number(row.return_visits) || 0,
    };
  }

  /** One customer's full event history for this tenant, newest first. */
  async customerTimeline<T = any>(customerId: string): Promise<T[]> {
    const { data, error } = await this.supabase.rpc("customer_timeline", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
    });
    if (error) throw new Error(`customerTimeline failed: ${error.message}`);
    return (data ?? []) as T[];
  }

  /** Most recent prize_won events across the tenant (live winners feed). */
  async liveWinners<T = any>(limit = 50): Promise<T[]> {
    const { data, error } = await this.supabase.rpc("live_winners", {
      p_business_id: this.businessId,
      p_limit: limit,
    });
    if (error) throw new Error(`liveWinners failed: ${error.message}`);
    return (data ?? []) as T[];
  }

  /** Per-prize stock across the tenant's campaigns (gift inventory). */
  async giftInventory<T = any>(): Promise<T[]> {
    const { data, error } = await this.supabase.rpc("gift_inventory", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`giftInventory failed: ${error.message}`);
    return (data ?? []) as T[];
  }

  /**
   * Append a tenant-scoped audit event. business_id and merchant_id are taken
   * from the authenticated session, so callers cannot mis-attribute an action.
   * Best-effort: a logging failure is swallowed (and console-logged) so it can
   * never break the underlying business mutation.
   */
  async audit(
    action: string,
    entity: string,
    entityId: string | null,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const { error } = await this.supabase.rpc("record_audit_event", {
        p_business_id: this.businessId,
        p_merchant_id: this.session.merchantId,
        p_action: action,
        p_entity: entity,
        p_entity_id: entityId,
        p_metadata: metadata,
      });
      if (error) {
        console.error(`audit(${action}) failed:`, error.message);
      }
    } catch (err) {
      console.error(`audit(${action}) threw:`, err);
    }
  }

  // ---------- Campaign Events (unified lifecycle log, V1.1) ----------
  //
  // Append-only, immutable events over the whole campaign lifecycle.
  // The actor is always resolved from the authenticated session, and
  // business_id from the tenant, so an event can never be mis-attributed
  // or cross a tenant boundary. Like audit(), recording is best-effort:
  // a logging failure is swallowed so it can never break the underlying
  // business mutation. Events are only ever generated here (server-side).

  /**
   * Append one campaign event as the session's merchant actor.
   * @param eventType  one of the tracked CampaignEventType values
   * @param campaignId the affected campaign, or null for tenant-level events
   * @param metadata   event-shaped payload (see 0016 examples)
   * @param ctx        optional request context (ip / user agent)
   */
  async recordEvent(
    eventType: CampaignEventType,
    campaignId: string | null,
    metadata: Record<string, unknown> = {},
    ctx: { ip?: string | null; userAgent?: string | null } = {}
  ): Promise<void> {
    try {
      const { error } = await this.supabase.rpc("record_campaign_event", {
        p_business_id: this.businessId,
        p_campaign_id: campaignId,
        p_actor_type: actorTypeForRole(this.session.role),
        p_actor_id: this.session.merchantId,
        p_event_type: eventType,
        p_metadata: metadata,
        p_ip_address: ctx.ip ?? null,
        p_user_agent: ctx.userAgent ?? null,
      });
      if (error) {
        console.error(`recordEvent(${eventType}) failed:`, error.message);
      }
    } catch (err) {
      console.error(`recordEvent(${eventType}) threw:`, err);
    }
  }

  /** Newest-first event stream for one owned campaign (paginated). */
  async campaignTimeline(
    campaignId: string,
    limit = 50,
    offset = 0
  ): Promise<CampaignTimelineEvent[]> {
    const { data, error } = await this.supabase.rpc("campaign_timeline", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`campaignTimeline failed: ${error.message}`);
    return (data ?? []) as CampaignTimelineEvent[];
  }

  /** Headline activity rollup for one owned campaign. */
  async campaignActivitySummary(
    campaignId: string
  ): Promise<CampaignActivitySummary> {
    const { data, error } = await this.supabase.rpc(
      "campaign_activity_summary",
      { p_business_id: this.businessId, p_campaign_id: campaignId }
    );
    if (error) {
      throw new Error(`campaignActivitySummary failed: ${error.message}`);
    }
    const row = ((data ?? []) as any[])[0] ?? {};
    return {
      total_events: Number(row.total_events) || 0,
      distinct_actors: Number(row.distinct_actors) || 0,
      first_activity: row.first_activity ?? null,
      last_activity: row.last_activity ?? null,
      views: Number(row.views) || 0,
      scans: Number(row.scans) || 0,
      registrations: Number(row.registrations) || 0,
      scratches: Number(row.scratches) || 0,
      prizes: Number(row.prizes) || 0,
      coupons: Number(row.coupons) || 0,
      redemptions: Number(row.redemptions) || 0,
    };
  }

  /** Per-event-type counts for one owned campaign. */
  async campaignEventCounts(campaignId: string): Promise<CampaignEventCount[]> {
    const { data, error } = await this.supabase.rpc("campaign_event_counts", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`campaignEventCounts failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      event_type: r.event_type,
      count: Number(r.count) || 0,
    }));
  }

  /** QR → redemption conversion (counts + derived rates) for one campaign. */
  async campaignConversion(campaignId: string): Promise<CampaignConversion> {
    const { data, error } = await this.supabase.rpc("campaign_conversion", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`campaignConversion failed: ${error.message}`);
    const row = ((data ?? []) as any[])[0] ?? {};
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
      scans: Number(row.scans) || 0,
      registrations: Number(row.registrations) || 0,
      scratches: Number(row.scratches) || 0,
      prizes: Number(row.prizes) || 0,
      coupons: Number(row.coupons) || 0,
      redemptions: Number(row.redemptions) || 0,
      scan_to_reg_rate: num(row.scan_to_reg_rate),
      reg_to_play_rate: num(row.reg_to_play_rate),
      play_to_win_rate: num(row.play_to_win_rate),
      coupon_redeem_rate: num(row.coupon_redeem_rate),
    };
  }

  /** Per-campaign leaderboard across the whole tenant (one round-trip). */
  async campaignPerformance(): Promise<CampaignPerformanceRow[]> {
    const { data, error } = await this.supabase.rpc("campaign_performance", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`campaignPerformance failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      campaign_status: r.campaign_status,
      total_events: Number(r.total_events) || 0,
      scans: Number(r.scans) || 0,
      registrations: Number(r.registrations) || 0,
      scratches: Number(r.scratches) || 0,
      redemptions: Number(r.redemptions) || 0,
      last_activity: r.last_activity ?? null,
    }));
  }

  /** Tenant-wide newest-first activity feed (dashboard Recent Events). */
  async recentEvents(limit = 20): Promise<RecentCampaignEvent[]> {
    const { data, error } = await this.supabase.rpc("business_recent_events", {
      p_business_id: this.businessId,
      p_limit: limit,
    });
    if (error) throw new Error(`recentEvents failed: ${error.message}`);
    return (data ?? []) as RecentCampaignEvent[];
  }

  /** Events-per-day for one owned campaign over a bounded window. */
  async campaignDailyActivity(
    campaignId: string,
    days = 30
  ): Promise<CampaignDailyActivityRow[]> {
    const { data, error } = await this.supabase.rpc("campaign_daily_activity", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_days: days,
    });
    if (error) throw new Error(`campaignDailyActivity failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      day: r.day,
      events: Number(r.events) || 0,
      scans: Number(r.scans) || 0,
      plays: Number(r.plays) || 0,
      redemptions: Number(r.redemptions) || 0,
    }));
  }

  /**
   * Traffic-source breakdown for the whole tenant (one row per source),
   * aggregated from the immutable customer_events log. Powers the dashboard
   * "Traffic Sources" panel. Sources missing at capture time collapse to
   * "direct" server-side, so every play is bucketed.
   */
  async trafficSources(): Promise<TrafficSourceRow[]> {
    const { data, error } = await this.supabase.rpc("traffic_sources", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`trafficSources failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      source: r.source,
      qr_scans: Number(r.qr_scans) || 0,
      registrations: Number(r.registrations) || 0,
      plays: Number(r.plays) || 0,
      wins: Number(r.wins) || 0,
      redemptions: Number(r.redemptions) || 0,
    }));
  }

  /**
   * Merchant-defined traffic sources joined with live analytics from the
   * immutable customer_events log (merchant_sources RPC, 0023). One
   * round-trip; tenant-scoped by business_id.
   */
  async merchantSources(): Promise<import("@/lib/types").MerchantSourceRow[]> {
    const { data, error } = await this.supabase.rpc("merchant_sources", {
      p_business_id: this.businessId,
    });
    if (error) throw new Error(`merchantSources failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      campaign_id: r.campaign_id ?? null,
      slug: r.slug,
      label: r.label,
      qr_scans: Number(r.qr_scans) || 0,
      registrations: Number(r.registrations) || 0,
      plays: Number(r.plays) || 0,
      wins: Number(r.wins) || 0,
      redemptions: Number(r.redemptions) || 0,
      created_at: r.created_at,
    }));
  }

  /** Per-reward win/redeem/inventory rollup for one owned campaign. */
  async rewardPerformance(
    campaignId: string
  ): Promise<import("@/lib/types").RewardPerformanceRow[]> {
    const { data, error } = await this.supabase.rpc("reward_performance", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`rewardPerformance failed: ${error.message}`);
    return ((data ?? []) as any[]).map((r) => ({
      prize_id: r.prize_id,
      name: r.name,
      prize_type: r.prize_type,
      is_active: !!r.is_active,
      total_quantity: Number(r.total_quantity) || 0,
      won_count: Number(r.won_count) || 0,
      remaining: Number(r.remaining) || 0,
      redeemed: Number(r.redeemed) || 0,
    }));
  }

  /** Post Win redirect funnel counts + most-visited link for one campaign. */
  async redirectAnalytics(
    campaignId: string
  ): Promise<import("@/lib/types").RedirectAnalytics> {
    const { data, error } = await this.supabase.rpc("redirect_analytics", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
    });
    if (error) throw new Error(`redirectAnalytics failed: ${error.message}`);
    const r = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      views: Number(r.views) || 0,
      starts: Number(r.starts) || 0,
      opens: Number(r.opens) || 0,
      completes: Number(r.completes) || 0,
      cancels: Number(r.cancels) || 0,
      most_visited: r.most_visited ?? null,
    };
  }

  /** Create a merchant-defined traffic source; returns its new id. */
  async createSource(
    slug: string,
    label: string,
    campaignId: string | null = null
  ): Promise<string> {
    const { data, error } = await this.supabase.rpc("merchant_create_source", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_slug: slug,
      p_label: label,
    });
    if (error) throw new Error(`createSource failed: ${error.message}`);
    return data as string;
  }

  /** Delete a merchant-defined traffic source owned by this tenant. */
  async deleteSource(sourceId: string): Promise<void> {
    const { error } = await this.supabase.rpc("merchant_delete_source", {
      p_business_id: this.businessId,
      p_source_id: sourceId,
    });
    if (error) throw new Error(`deleteSource failed: ${error.message}`);
  }

  /** Update one owned campaign's Post Win redirect settings. */
  async updateRedirect(
    campaignId: string,
    enabled: boolean,
    delay: number,
    destinationType: string,
    url: string | null
  ): Promise<void> {
    const { error } = await this.supabase.rpc("merchant_update_redirect", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_enabled: enabled,
      p_delay: delay,
      p_destination_type: destinationType,
      p_url: url,
    });
    if (error) throw new Error(`updateRedirect failed: ${error.message}`);
  }

  /** Update one owned campaign's Customer Experience settings. */
  async updateExperience(
    campaignId: string,
    settings: {
      preloaderEnabled: boolean;
      preloaderDuration: number;
      confettiEnabled: boolean;
      soundEnabled: boolean;
      hapticsEnabled: boolean;
      openNativeApp: boolean;
      showCountdown: boolean;
      allowSkip: boolean;
      buttonText: string | null;
      theme: string;
    }
  ): Promise<void> {
    const { error } = await this.supabase.rpc("merchant_update_experience", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_preloader_enabled: settings.preloaderEnabled,
      p_preloader_duration: settings.preloaderDuration,
      p_confetti_enabled: settings.confettiEnabled,
      p_sound_enabled: settings.soundEnabled,
      p_haptics_enabled: settings.hapticsEnabled,
      p_open_native_app: settings.openNativeApp,
      p_show_countdown: settings.showCountdown,
      p_allow_skip: settings.allowSkip,
      p_button_text: settings.buttonText,
      p_theme: settings.theme,
    });
    if (error) throw new Error(`updateExperience failed: ${error.message}`);
  }

  // ---------- Ownership guard ----------
  /** True iff the campaign belongs to this tenant. */
  async ownsCampaign(campaignId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("business_id", this.businessId)
      .maybeSingle();
    if (error) throw new Error(`ownsCampaign failed: ${error.message}`);
    return !!data;
  }

  /**
   * Fetch a single campaign owned by this tenant, or null. Combines fetch +
   * ownership check so callers never see another tenant's row.
   */
  async getCampaign<T = Record<string, unknown>>(
    campaignId: string,
    columns = "*"
  ): Promise<T | null> {
    const { data, error } = await this.supabase
      .from("campaigns")
      .select(columns)
      .eq("id", campaignId)
      .eq("business_id", this.businessId)
      .maybeSingle();
    if (error) throw new Error(`getCampaign failed: ${error.message}`);
    return (data as T | null) ?? null;
  }

  /**
   * Find a free, globally-unique campaign slug derived from `base`. Campaign
   * slugs are global (route /c/[slug]) so this check is intentionally NOT
   * tenant-scoped — but it stays inside the repository so actions never touch
   * the raw client.
   */
  async freeCampaignSlug(base: string): Promise<string> {
    const clean = slugify(base);
    for (let i = 0; i < 20; i++) {
      const candidate = i === 0 ? clean : `${clean}-${i + 1}`;
      const { data, error } = await this.supabase
        .from("campaigns")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (error) throw new Error(`freeCampaignSlug failed: ${error.message}`);
      if (!data) return candidate;
    }
    throw new Error(`Could not find a free slug for ${base}`);
  }

  // ---------- Prizes (scoped through parent campaign) ----------

  /**
   * SELECT prizes for a campaign. prizes has no business_id, so tenant safety
   * is enforced by an FK inner-join filter on campaigns.business_id — a foreign
   * campaign_id yields zero rows even without a prior ownership check.
   */
  selectPrizes(campaignId: string, columns = "*") {
    return this.supabase
      .from("prizes")
      .select(`${columns}, campaigns!inner(business_id)`)
      .eq("campaign_id", campaignId)
      .eq("campaigns.business_id", this.businessId);
  }

  /**
   * SELECT every prize belonging to any of the tenant's campaigns. Scoped by
   * the same FK inner-join on campaigns.business_id, so no manual campaign-id
   * list is needed and cross-tenant prizes can never leak.
   */
  selectAllPrizes(columns = "*") {
    return this.supabase
      .from("prizes")
      .select(`${columns}, campaigns!inner(business_id)`)
      .eq("campaigns.business_id", this.businessId);
  }

  /** INSERT prizes for a campaign the tenant owns. Verifies ownership first. */
  async insertPrizes(
    campaignId: string,
    prizes: Array<Record<string, unknown>>
  ): Promise<void> {
    if (!(await this.ownsCampaign(campaignId))) {
      throw new Error("insertPrizes: campaign not owned by tenant");
    }
    const rows = prizes.map((p) => ({ ...p, campaign_id: campaignId }));
    const { error } = await this.supabase.from("prizes").insert(rows);
    if (error) throw new Error(`insertPrizes failed: ${error.message}`);
  }

  /** Enable/disable one reward (parks/restores draw weight in SQL). */
  async setPrizeActive(campaignId: string, prizeId: string, active: boolean): Promise<void> {
    await this.callRpc("merchant_set_prize_active", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_prize_id: prizeId,
      p_active: active,
    });
  }

  /** Clone one reward within the same campaign; returns the new prize id. */
  async duplicatePrize(campaignId: string, prizeId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("merchant_duplicate_prize", {
      p_business_id: this.businessId,
      p_campaign_id: campaignId,
      p_prize_id: prizeId,
    });
    if (error) throw new Error(`rpc(merchant_duplicate_prize) failed: ${error.message}`);
    return data as string;
  }

  // ---------- Coupons (business_id table, extra campaign scoping) ----------

  /**
   * Update coupons for one of the tenant's campaigns (e.g. WhatsApp retry).
   * Scoped by BOTH business_id and campaign_id. Returns rows affected.
   */
  async updateCouponsForCampaign(
    campaignId: string,
    patch: Record<string, unknown>,
    extraFilters: Record<string, string> = {}
  ): Promise<number> {
    let q = this.supabase
      .from("coupons")
      .update(patch, { count: "exact" })
      .eq("business_id", this.businessId)
      .eq("campaign_id", campaignId);
    for (const [col, val] of Object.entries(extraFilters)) {
      q = q.eq(col, val);
    }
    const { error, count } = await q;
    if (error) {
      throw new Error(`updateCouponsForCampaign failed: ${error.message}`);
    }
    return count ?? 0;
  }
}

/**
 * Resolve the tenant repository from the current merchant session.
 * Returns null when there is no valid session — callers must redirect to
 * /m/login. This is the single entry point; the raw service-role client is
 * never exposed to merchant-facing code.
 */
export async function getTenantRepository(): Promise<TenantRepository | null> {
  const session = await getMerchantSession();
  if (!session) return null;
  return new TenantRepository(adminClient(), session);
}

/**
 * Like getTenantRepository but throws when there is no session. Use in code
 * paths where the caller has already asserted authentication.
 */
export async function requireTenantRepository(): Promise<TenantRepository> {
  const repo = await getTenantRepository();
  if (!repo) throw new Error("No authenticated merchant tenant context");
  return repo;
}
