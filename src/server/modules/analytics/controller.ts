import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { ok } from "@/server/http/responses";
import { AnalyticsService } from "@/server/modules/analytics/service";
import type { AnalyticsTrendsQuery } from "@/server/modules/analytics/validator";

/**
 * AnalyticsController — orchestrates the merchant reporting endpoints. Thin:
 * checks scope, delegates to the service, envelopes the result. No SQL, no
 * business logic.
 */
export class AnalyticsController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: AnalyticsService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new AnalyticsService(ctx, this.businessId, this.tenant);
  }

  async overview(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.overview();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async performance(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.performance();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async trends(query: AnalyticsTrendsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.trends(query.days);
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
