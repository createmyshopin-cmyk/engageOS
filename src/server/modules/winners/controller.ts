import "server-only";
import { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireRole, requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { WinnersService } from "@/server/modules/winners/service";
import type {
  ExportWinnersQuery,
  ListWinnersQuery,
  WinnersSummaryQuery,
} from "@/server/modules/winners/validator";
import { parseWinnerFilters } from "@/server/modules/winners/validator";

export class WinnersController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: WinnersService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new WinnersService(ctx, this.businessId, this.tenant);
  }

  async list(query: ListWinnersQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const filters = parseWinnerFilters(query);
    const { items, page } = await this.service.list({
      page: query.page,
      limit: query.limit,
      filters,
    });
    return paginated(items, page, {
      correlationId: this.ctx.correlationId,
      version: this.ctx.version,
    });
  }

  async summary(query: WinnersSummaryQuery) {
    requireScope(this.principal(), "read");
    const filters = parseWinnerFilters(query);
    return this.service.summary(filters.wonFrom, filters.wonTo);
  }

  async exportWinners(query: ExportWinnersQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    requireRole(this.principal(), "owner", "manager");
    const filters = parseWinnerFilters(query);
    const { body, filename, rowCount, contentType } = await this.service.exportWinners(filters);
    await this.tenant
      .recordEvent("customer.export", null, {
        format: "csv",
        rowCount,
        source: "winners_page",
      })
      .catch(() => {});
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
}
