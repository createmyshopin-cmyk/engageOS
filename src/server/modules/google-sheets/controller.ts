import "server-only";
import { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { GoogleSheetsExportService } from "@/server/modules/google-sheets/service";
import type {
  SheetsCodesQuery,
  SheetsCustomersQuery,
  SheetsExportQuery,
} from "@/server/modules/google-sheets/validator";
import type { CustomerJoinedFilter, CustomerRewardFilter } from "@/server/modules/customers/validator";

function joinedDays(joined?: CustomerJoinedFilter): number | null {
  switch (joined) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return null;
  }
}

function customerFilters(query: SheetsCustomersQuery) {
  const hasRange = !!(query.joinedFrom || query.joinedTo);
  return {
    search: query.search?.trim() ? query.search.trim() : null,
    rewardFilter: (query.rewardFilter ?? "all") as CustomerRewardFilter,
    joinedDays: hasRange ? null : joinedDays(query.joined),
    joinedFrom: query.joinedFrom ?? null,
    joinedTo: query.joinedTo ?? null,
  };
}

export class GoogleSheetsExportController extends Controller {
  private readonly service: GoogleSheetsExportService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new GoogleSheetsExportService(
      ctx,
      this.businessId,
      tenantRepositoryFor(this.principal())
    );
  }

  private assertExportScope(): void {
    const principal = this.principal();
    if (principal.scopes.includes("sheets:export") || principal.scopes.includes("*")) return;
    requireScope(principal, "read");
  }

  async export(query: SheetsExportQuery): Promise<NextResponse> {
    this.assertExportScope();
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = query.limit ?? 100;
    const { items, page } = await this.service.exportFeed(query, limit, cursor);
    await this.service.recordSync();
    return paginated(items, page, {
      correlationId: this.ctx.correlationId,
      version: this.ctx.version,
    });
  }

  async customers(query: SheetsCustomersQuery): Promise<NextResponse> {
    this.assertExportScope();
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = query.limit ?? 100;
    const { items, page } = await this.service.listCustomers({
      limit,
      cursor,
      ...customerFilters(query),
    });
    await this.service.recordSync();
    return paginated(items, page, {
      correlationId: this.ctx.correlationId,
      version: this.ctx.version,
    });
  }

  async codes(query: SheetsCodesQuery): Promise<NextResponse> {
    this.assertExportScope();
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = query.limit ?? 100;
    const { items, page } = await this.service.listCodes({
      limit,
      cursor,
      status: query.status ?? null,
      campaignId: query.campaignId ?? null,
    });
    await this.service.recordSync();
    return paginated(items, page, {
      correlationId: this.ctx.correlationId,
      version: this.ctx.version,
    });
  }
}
