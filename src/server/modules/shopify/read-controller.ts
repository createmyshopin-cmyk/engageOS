import "server-only";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { ok } from "@/server/http/responses";
import type { NextResponse } from "next/server";
import { ShopifyReadService } from "@/server/modules/shopify/read-service";

/**
 * ShopifyReadController — the merchant-facing read surface for Shopify. Derives
 * the tenant from the principal (never from input), enforces read scope, and
 * envelopes the overview. No SQL, no business rules, no OAuth.
 */
export class ShopifyReadController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: ShopifyReadService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new ShopifyReadService(ctx, this.businessId, this.tenant);
  }

  async overview(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.overview();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async scopes(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.scopes();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  /**
   * Force a fresh Shopify token exchange to pick up newly-enabled scopes. This
   * mutates stored state (rotates the cached token + scopes), so it requires
   * write scope rather than read.
   */
  async refreshScopes(): Promise<NextResponse> {
    requireScope(this.principal(), "write");
    const data = await this.service.refreshScopes();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async couponDrops(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.couponDrops();
    return ok({ campaigns: data }, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async retryCouponDrops(body: { campaignId?: string }): Promise<NextResponse> {
    requireScope(this.principal(), "write");
    const retried = await this.service.retryCouponDropActivations(body.campaignId);
    return ok({ retried }, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
