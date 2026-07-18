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
}
