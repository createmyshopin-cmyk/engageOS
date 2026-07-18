import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { MarketingService } from "@/server/modules/marketing/service";
import type { ListBroadcastsQuery } from "@/server/modules/marketing/validator";

/**
 * MarketingController — orchestrates the marketing read endpoint. Thin: checks
 * scope, decodes the cursor, delegates to the service, envelopes the result.
 * Derives the tenant from the principal (never from input). No SQL, no business
 * rules, no send path — launching broadcasts is out of scope for this phase.
 */
export class MarketingController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: MarketingService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new MarketingService(ctx, this.businessId, this.tenant);
  }

  async listBroadcasts(query: ListBroadcastsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.listBroadcasts({
      limit: query.limit ?? 25,
      cursor,
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
