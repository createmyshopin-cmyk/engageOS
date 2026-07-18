import "server-only";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import type { NextResponse } from "next/server";
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
} from "@/server/modules/customers/validator";

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
      search: query.search ?? null,
      direction: query.direction ?? "desc",
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
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
