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
}
