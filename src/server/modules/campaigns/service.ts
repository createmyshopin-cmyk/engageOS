import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import type { Cursor } from "@/server/http/pagination";
import { buildPage } from "@/server/http/pagination";
import { CampaignRepository } from "@/server/modules/campaigns/repository";
import { toCampaignListItemDTO, type CampaignListItemDTO } from "@/server/modules/campaigns/dto";

/**
 * CampaignService — read/manage facade over the campaign engine. For the list,
 * it fetches one keyset page of campaigns and enriches each with its rollup
 * stats, then shapes the wire DTO. The play/scratch/coupon engines stay
 * authoritative; this layer only reports on them.
 */
export class CampaignService extends Service {
  private readonly repo: CampaignRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new CampaignRepository(tenant);
  }

  /** Keyset-paginated campaign list with per-campaign stats. */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
  }): Promise<{ items: CampaignListItemDTO[]; page: PageInfo }> {
    // Fetch limit + 1 to detect a further page; stats cover all tenant
    // campaigns (a single rollup call), joined in memory by id.
    const rows = await this.repo.list({
      limit: opts.limit,
      cursor: opts.cursor,
      status: opts.status,
    });
    const { items: pageRows, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    }));

    const stats = await this.repo.statsByCampaign();
    const items = pageRows.map((r) => toCampaignListItemDTO(r, stats.get(r.id)));
    return { items, page };
  }
}
