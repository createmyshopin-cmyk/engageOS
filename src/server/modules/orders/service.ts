import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import { buildPage, type Cursor } from "@/server/http/pagination";
import { OrderRepository } from "@/server/modules/orders/repository";
import { toOrderListItemDTO, type OrderListItemDTO } from "@/server/modules/orders/dto";

/**
 * OrderService — read-only order business logic. Fetches one keyset page and
 * maps rows to the wire DTO. Holds no SQL and no HTTP concerns; tenancy arrives
 * as a constructor argument so it is impossible to mis-scope.
 */
export class OrderService extends Service {
  private readonly repo: OrderRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new OrderRepository(tenant);
  }

  /** Keyset-paginated order list, newest-first, with optional filters. */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    customerId: string | null;
  }): Promise<{ items: OrderListItemDTO[]; page: PageInfo }> {
    const rows = await this.repo.list(opts);
    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.placed_at,
      id: r.id,
    } satisfies Cursor));
    return { items: items.map(toOrderListItemDTO), page };
  }
}
