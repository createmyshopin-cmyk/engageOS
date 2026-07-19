import "server-only";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { LoyaltyService } from "@/server/modules/loyalty/service";

/**
 * LoyaltyController — orchestrates the loyalty read endpoint. Thin: checks
 * scope, delegates to the service, returns plain data (the wrapper envelopes
 * it). Tenant from the principal; no SQL, no business rules.
 */
export class LoyaltyController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: LoyaltyService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new LoyaltyService(ctx, this.businessId, this.tenant);
  }

  async get(customerId: string) {
    requireScope(this.principal(), "read");
    return this.service.forCustomer(customerId);
  }

  async overview() {
    requireScope(this.principal(), "read");
    return this.service.overview();
  }

  async leaderboard(limit: number, offset: number) {
    requireScope(this.principal(), "read");
    return this.service.leaderboard({ limit, offset });
  }

  async wallet(customerId: string) {
    requireScope(this.principal(), "read");
    return this.service.wallet(customerId);
  }

  async pointsHistory(customerId: string, limit: number, offset: number) {
    requireScope(this.principal(), "read");
    return this.service.pointsHistory(customerId, { limit, offset });
  }

  async adjustPoints(customerId: string, delta: number, note: string | null) {
    requireScope(this.principal(), "write");
    return this.service.adjustPoints(customerId, {
      delta,
      note,
      actorId: this.principal().actorId,
    });
  }

  async listRules() {
    requireScope(this.principal(), "read");
    return this.service.listRules();
  }

  async updateRules(
    rules: Array<{
      ruleType: string;
      pointsPerUnit?: number | null;
      fixedPoints?: number | null;
      multiplier?: number;
      active?: boolean;
    }>
  ) {
    requireScope(this.principal(), "write");
    return this.service.updateRules(rules);
  }

  async listTiers() {
    requireScope(this.principal(), "read");
    return this.service.listTiers();
  }

  async updateTiers(
    tiers: Array<{
      slug: string;
      name?: string;
      minPoints?: number;
      maxPoints?: number | null;
      color?: string;
      icon?: string;
      bonusMultiplier?: number;
      benefits?: string[];
    }>
  ) {
    requireScope(this.principal(), "write");
    return this.service.updateTiers(tiers);
  }
}
