import "server-only";
import type { NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { paginated, ok } from "@/server/http/responses";
import { decodeProductListCursor, DEFAULT_PRODUCT_SORT } from "@/server/modules/products/product-list-sort";
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
    const sort = query.sort ?? DEFAULT_PRODUCT_SORT;
    const cursor = query.cursor ? decodeProductListCursor(query.cursor, sort) : null;
    const { items, page } = await this.service.list({
      limit: query.limit ?? 25,
      cursor,
      search: query.search ?? null,
      status: query.status ?? null,
      couponFilter: query.couponFilter ?? "all",
      stockFilter: query.stockFilter ?? "all",
      newFilter: query.newFilter ?? "all",
      sort,
    });
    return paginated(items, page, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async couponSummary(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const summary = await this.service.couponSummary();
    return ok(summary, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  async couponRedemptions(productId: string): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const result = await this.service.couponRedemptions(productId);
    return ok(result, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
