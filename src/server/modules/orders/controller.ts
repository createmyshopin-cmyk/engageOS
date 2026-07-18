import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { OrderService } from "@/server/modules/orders/service";
import type { ListOrdersQuery } from "@/server/modules/orders/validator";

/**
 * OrderController — orchestrates the orders read endpoint. Thin: checks scope,
 * decodes the cursor, delegates to the service, envelopes the result. Derives
 * the tenant from the principal (never from input). No SQL, no business rules.
 */
export class OrderController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: OrderService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new OrderService(ctx, this.businessId, this.tenant);
  }

  async list(query: ListOrdersQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.list({
      limit: query.limit ?? 25,
      cursor,
      status: query.status ?? null,
      customerId: query.customerId ?? null,
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
