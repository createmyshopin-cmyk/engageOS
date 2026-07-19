import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { CampaignService } from "@/server/modules/campaigns/service";
import type { ListCampaignsQuery } from "@/server/modules/campaigns/validator";

/** Map legacy/UI alias `ended` to the DB value `completed`. */
function normalizeCampaignStatusFilter(status: string | null): string | null {
  if (!status) return null;
  return status === "ended" ? "completed" : status;
}

/**
 * CampaignController — orchestrates the campaign read/manage endpoints. Thin:
 * checks scope, decodes the cursor, delegates to the service, envelopes the
 * result. No SQL, no play logic.
 */
export class CampaignController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: CampaignService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new CampaignService(ctx, this.businessId, this.tenant);
  }

  async list(query: ListCampaignsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.list({
      limit: query.limit ?? 25,
      cursor,
      status: normalizeCampaignStatusFilter(query.status ?? null),
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
