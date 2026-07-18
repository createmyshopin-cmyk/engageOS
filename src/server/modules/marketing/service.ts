import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import { buildPage, type Cursor } from "@/server/http/pagination";
import { MarketingRepository } from "@/server/modules/marketing/repository";
import { toBroadcastListItemDTO, type BroadcastListItemDTO } from "@/server/modules/marketing/dto";

/**
 * MarketingService — read-only marketing business logic. Fetches one keyset
 * page of the broadcast ledger and maps rows to the wire DTO. Holds no SQL and
 * no HTTP concerns; tenancy arrives as a constructor argument so it cannot be
 * mis-scoped. No send/scheduling logic lives here (no automation in this phase).
 */
export class MarketingService extends Service {
  private readonly repo: MarketingRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new MarketingRepository(tenant);
  }

  /** Keyset-paginated broadcast list, newest-first. */
  async listBroadcasts(opts: {
    limit: number;
    cursor: Cursor | null;
  }): Promise<{ items: BroadcastListItemDTO[]; page: PageInfo }> {
    const rows = await this.repo.list(opts);
    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    } satisfies Cursor));
    return { items: items.map(toBroadcastListItemDTO), page };
  }
}
