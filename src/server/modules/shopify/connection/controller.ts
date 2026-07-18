import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireRole } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { ok } from "@/server/http/responses";
import { ShopifyConnectionService } from "@/server/modules/shopify/connection/service";

/**
 * ShopifyConnectionController — store-connection lifecycle (connect + disconnect).
 *
 * Both are tenant-wide, sensitive actions (they write or revoke the store's
 * access token), so they are gated to owner/manager — a staff read/redeem
 * principal cannot alter the integration. Tenant derived from the principal,
 * never input. Credentials are validated + encrypted in the service/adapter and
 * never echoed back.
 */
export class ShopifyConnectionController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: ShopifyConnectionService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new ShopifyConnectionService(ctx, this.businessId, this.tenant);
  }

  async connect(input: {
    shopDomain: string;
    accessToken: string;
    apiSecret: string;
  }): Promise<NextResponse> {
    requireRole(this.principal(), "owner", "manager");
    const data = await this.service.connect(input);
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async disconnect(): Promise<NextResponse> {
    requireRole(this.principal(), "owner", "manager");
    const data = await this.service.disconnect();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
