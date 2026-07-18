import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated } from "@/server/http/responses";
import { decodeCursor, type Cursor } from "@/server/http/pagination";
import { ProductService } from "@/server/modules/products/service";
import type { ListProductsQuery } from "@/server/modules/products/validator";

/**
 * ProductController — orchestrates the products read endpoint. Thin: checks
 * scope, decodes the cursor, delegates, envelopes. Tenant from the principal.
 */
export class ProductController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: ProductService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new ProductService(ctx, this.businessId, this.tenant);
  }

  async list(query: ListProductsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const cursor: Cursor | null = query.cursor ? decodeCursor(query.cursor) : null;
    const { items, page } = await this.service.list({
      limit: query.limit ?? 25,
      cursor,
      search: query.search ?? null,
      status: query.status ?? null,
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
