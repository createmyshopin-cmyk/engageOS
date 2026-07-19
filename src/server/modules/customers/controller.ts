import "server-only";
import { Controller } from "@/server/core/Controller";
import { requireScope, requireRole } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { NextResponse } from "next/server";
import { CustomerService } from "@/server/modules/customers/service";
import type { Cursor } from "@/server/http/pagination";
import { decodeCursor } from "@/server/http/pagination";
import type {
  ListCustomersQuery,
  UpsertCustomerBody,
  SetConsentBody,
  AddTagBody,
  MergeCustomersBody,
  TimelineQuery,
  ExportCustomersQuery,
  CustomerJoinedFilter,
  CustomerRewardFilter,
} from "@/server/modules/customers/validator";

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

function listFilters(query: {
  search?: string;
  rewardFilter?: CustomerRewardFilter;
  joined?: CustomerJoinedFilter;
  joinedFrom?: string;
  joinedTo?: string;
}) {
  const hasRange = !!(query.joinedFrom || query.joinedTo);
  return {
    search: query.search?.trim() ? query.search.trim() : null,
    rewardFilter: query.rewardFilter ?? "all",
    joinedDays: hasRange ? null : joinedDays(query.joined),
    joinedFrom: query.joinedFrom ?? null,
    joinedTo: query.joinedTo ?? null,
  };
}

/**
 * CustomerController — thin orchestration between the route wrapper and
 * CustomerService. It derives the tenant repository from the principal (never
 * from input), enforces scopes, and returns plain data (or a prebuilt
 * paginated response). No business rules, no SQL.
 */
export class CustomerController extends Controller {
  private readonly service: CustomerService;
  private readonly tenant = tenantRepositoryFor(this.principal());

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new CustomerService(ctx, this.businessId, this.tenant);
  }

  async list(query: ListCustomersQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.list({
      limit: query.limit ?? 25,
      cursor,
      direction: query.direction ?? "desc",
      ...listFilters(query),
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async exportCustomers(query: ExportCustomersQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    requireRole(this.principal(), "owner", "manager");
    const format = query.format ?? "csv";
    const { body, filename, rowCount, contentType } = await this.service.exportCustomers(
      listFilters(query),
      format
    );
    await this.tenant.recordEvent("customer.export", null, {
      format,
      rowCount,
      source: "customers_page",
    }).catch(() => {});
    const payload: BodyInit =
      typeof body === "string" ? body : new Uint8Array(body);
    return new NextResponse(payload, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  async get(id: string) {
    requireScope(this.principal(), "read");
    return this.service.get(id);
  }

  async get360(id: string) {
    requireScope(this.principal(), "read");
    return this.service.get360(id);
  }

  async upsert(body: UpsertCustomerBody) {
    requireScope(this.principal(), "write");
    return this.service.upsert(this.tenant, body);
  }

  async setConsent(id: string, body: SetConsentBody) {
    requireScope(this.principal(), "write");
    return this.service.setConsent(this.tenant, id, body.channel, body.status, body.source);
  }

  async addTag(id: string, body: AddTagBody) {
    requireScope(this.principal(), "write");
    return this.service.addTag(this.tenant, id, body.name, body.color);
  }

  async remove(id: string) {
    requireScope(this.principal(), "write");
    await this.service.remove(this.tenant, id);
    return { deleted: true };
  }

  async merge(body: MergeCustomersBody) {
    requireScope(this.principal(), "write");
    return this.service.merge(this.tenant, body.survivorId, body.duplicateId);
  }

  async timeline(id: string, query: TimelineQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const { items, page } = await this.service.timeline(id, query.limit ?? 25, query.before ?? null);
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
