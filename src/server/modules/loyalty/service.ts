import "server-only";
import { Service } from "@/server/core/Service";
import { NotFoundError } from "@/server/core/errors";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { LoyaltyRepository } from "@/server/modules/loyalty/repository";
import {
  toLoyaltyProfileDTO,
  toLoyaltyOverviewDTO,
  toLoyaltyLeaderboardItemDTO,
  toLoyaltyWalletDTO,
  toPointsTransactionDTO,
  toPointsRuleDTO,
  toMembershipTierDTO,
  emptyLoyaltyProfileDTO,
  emptyLoyaltyOverviewDTO,
  emptyLoyaltyWalletDTO,
  type LoyaltyProfileDTO,
  type LoyaltyOverviewDTO,
  type LoyaltyLeaderboardItemDTO,
  type LoyaltyWalletDTO,
  type PointsTransactionDTO,
  type PointsRuleDTO,
  type MembershipTierDTO,
} from "@/server/modules/loyalty/dto";

/**
 * LoyaltyService — read-only loyalty standing. Resolves the precomputed
 * analytics row for a customer; if the customer exists but has no analytics row
 * yet (never engaged), returns a zeroed standing rather than a 404 — a real,
 * meaningful "no activity" state. A foreign/unknown customer id is a 404.
 */
export class LoyaltyService extends Service {
  private readonly repo: LoyaltyRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new LoyaltyRepository(tenant);
  }

  async forCustomer(customerId: string): Promise<LoyaltyProfileDTO> {
    const row = await this.repo.byCustomer(customerId);
    if (row) return toLoyaltyProfileDTO(row);

    // No analytics row: distinguish "never engaged" (exists → zeroed) from
    // "not our customer" (404). The existence check is tenant-scoped.
    const exists = await this.repo.customerExists(customerId);
    if (!exists) throw new NotFoundError("Customer not found");
    return emptyLoyaltyProfileDTO(customerId);
  }

  async overview(): Promise<LoyaltyOverviewDTO> {
    const row = await this.repo.overview();
    return row ? toLoyaltyOverviewDTO(row) : emptyLoyaltyOverviewDTO();
  }

  async leaderboard(opts: {
    limit: number;
    offset: number;
  }): Promise<LoyaltyLeaderboardItemDTO[]> {
    const rows = await this.repo.leaderboard(opts.limit, opts.offset);
    return rows.map(toLoyaltyLeaderboardItemDTO);
  }

  async wallet(customerId: string): Promise<LoyaltyWalletDTO> {
    const row = await this.repo.wallet(customerId);
    if (row) return toLoyaltyWalletDTO(row);

    const exists = await this.repo.customerExists(customerId);
    if (!exists) throw new NotFoundError("Customer not found");
    return emptyLoyaltyWalletDTO(customerId);
  }

  async pointsHistory(
    customerId: string,
    opts: { limit: number; offset: number }
  ): Promise<PointsTransactionDTO[]> {
    const exists = await this.repo.customerExists(customerId);
    if (!exists) throw new NotFoundError("Customer not found");
    const rows = await this.repo.pointsHistory(customerId, opts.limit, opts.offset);
    return rows.map(toPointsTransactionDTO);
  }

  async adjustPoints(
    customerId: string,
    opts: { delta: number; note: string | null; actorId: string }
  ): Promise<PointsTransactionDTO | null> {
    const exists = await this.repo.customerExists(customerId);
    if (!exists) throw new NotFoundError("Customer not found");
    if (opts.delta === 0) return null;

    const txnId = await this.repo.adjustPoints({
      customerId,
      delta: opts.delta,
      note: opts.note,
      actorId: opts.actorId,
    });
    if (!txnId) return null;

    const history = await this.repo.pointsHistory(customerId, 1, 0);
    const latest = history[0];
    return latest ? toPointsTransactionDTO(latest) : null;
  }

  async listRules(): Promise<PointsRuleDTO[]> {
    const rows = await this.repo.listPointsRules();
    return rows.map(toPointsRuleDTO);
  }

  async updateRules(
    rules: Array<{
      ruleType: string;
      pointsPerUnit?: number | null;
      fixedPoints?: number | null;
      multiplier?: number;
      active?: boolean;
    }>
  ): Promise<PointsRuleDTO[]> {
    await this.repo.updatePointsRules(
      rules.map((r) => ({
        ruleType: r.ruleType,
        ...(r.pointsPerUnit !== undefined ? { pointsPerUnit: r.pointsPerUnit } : {}),
        ...(r.fixedPoints !== undefined ? { fixedPoints: r.fixedPoints } : {}),
        ...(r.multiplier !== undefined ? { multiplier: r.multiplier } : {}),
        ...(r.active !== undefined ? { active: r.active } : {}),
      }))
    );
    return this.listRules();
  }

  async listTiers(): Promise<MembershipTierDTO[]> {
    const rows = await this.repo.listMembershipTiers();
    return rows.map(toMembershipTierDTO);
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
  ): Promise<MembershipTierDTO[]> {
    await this.repo.updateMembershipTiers(
      tiers.map((t) => ({
        slug: t.slug,
        ...(t.name !== undefined ? { name: t.name } : {}),
        ...(t.minPoints !== undefined ? { minPoints: t.minPoints } : {}),
        ...(t.maxPoints !== undefined ? { maxPoints: t.maxPoints } : {}),
        ...(t.color !== undefined ? { color: t.color } : {}),
        ...(t.icon !== undefined ? { icon: t.icon } : {}),
        ...(t.bonusMultiplier !== undefined ? { bonusMultiplier: t.bonusMultiplier } : {}),
        ...(t.benefits !== undefined ? { benefits: t.benefits } : {}),
      }))
    );
    return this.listTiers();
  }
}
