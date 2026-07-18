import "server-only";
import { Service } from "@/server/core/Service";
import { NotFoundError } from "@/server/core/errors";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { LoyaltyRepository } from "@/server/modules/loyalty/repository";
import {
  toLoyaltyProfileDTO,
  emptyLoyaltyProfileDTO,
  type LoyaltyProfileDTO,
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
}
