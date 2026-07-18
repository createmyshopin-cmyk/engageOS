import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import { buildPage, type Cursor } from "@/server/http/pagination";
import { ProductRepository } from "@/server/modules/products/repository";
import { toProductListItemDTO, type ProductListItemDTO } from "@/server/modules/products/dto";

/**
 * ProductService — read-only catalog business logic. Fetches one keyset page
 * and maps rows to the wire DTO. No SQL, no HTTP; tenancy arrives as an argument.
 */
export class ProductService extends Service {
  private readonly repo: ProductRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new ProductRepository(tenant);
  }

  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    search: string | null;
    status: string | null;
  }): Promise<{ items: ProductListItemDTO[]; page: PageInfo }> {
    const rows = await this.repo.list(opts);
    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    } satisfies Cursor));
    return { items: items.map(toProductListItemDTO), page };
  }
}
