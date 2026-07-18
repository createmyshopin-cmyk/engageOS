import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { created, paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { EventService } from "@/server/modules/events/service";
import type { RecordEventBody, ListEventsQuery } from "@/server/modules/events/validator";

/** EventController — orchestrates the universal event stream endpoints. */
export class EventController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: EventService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new EventService(ctx, this.businessId, this.tenant);
  }

  async record(body: RecordEventBody): Promise<NextResponse> {
    requireScope(this.principal(), "write");
    const result = await this.service.record(body);
    return created(result, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async feed(query: ListEventsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.feed({
      limit: query.limit ?? 25,
      cursor,
      category: query.category ?? null,
      name: query.name ?? null,
      customerId: query.customerId ?? null,
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
