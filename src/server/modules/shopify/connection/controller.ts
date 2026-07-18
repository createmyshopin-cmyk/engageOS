import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireRole } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { ok } from "@/server/http/responses";
import { ShopifyConnectionService } from "@/server/modules/shopify/connection/service";

/**
 * ShopifyConnectionController — store-connection lifecycle (disconnect).
 *
 * Disconnecting is a destructive, tenant-wide action (it revokes the store's
 * access token), so it is gated to owner/manager — a staff read/redeem principal
 * cannot sever the integration. Tenant derived from the principal, never input.
 */
export class ShopifyConnectionController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: ShopifyConnectionService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new ShopifyConnectionService(ctx, this.businessId, this.tenant);
  }

  async disconnect(): Promise<NextResponse> {
    requireRole(this.principal(), "owner", "manager");
    const data = await this.service.disconnect();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
