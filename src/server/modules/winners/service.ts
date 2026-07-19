import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import { WinnersRepository } from "@/server/modules/winners/repository";
import { buildWinnersCsv } from "@/server/modules/winners/csv";
import {
  emptyWinnersSummaryDTO,
  toWinnerListItemDTO,
  toWinnersSummaryDTO,
  type WinnerListItemDTO,
  type WinnersSummaryDTO,
} from "@/server/modules/winners/dto";
import type { WinnerListFilters } from "@/server/modules/winners/validator";
import { prizeTypeLabel } from "@/lib/merchant/prize-labels";

export class WinnersService extends Service {
  private readonly repo: WinnersRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new WinnersRepository(tenant);
  }

  async summary(wonFrom: string | null, wonTo: string | null): Promise<WinnersSummaryDTO> {
    const row = await this.repo.summary(wonFrom, wonTo);
    return row ? toWinnersSummaryDTO(row) : emptyWinnersSummaryDTO();
  }

  async list(opts: {
    page: number;
    limit: number;
    filters: WinnerListFilters;
  }): Promise<{ items: WinnerListItemDTO[]; page: PageInfo & { totalCount: number; offset: number } }> {
    const offset = (opts.page - 1) * opts.limit;
    const rows = await this.repo.list({
      limit: opts.limit,
      offset,
      filters: opts.filters,
    });
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;
    const items = rows.map(toWinnerListItemDTO);
    const hasMore = offset + items.length < totalCount;
    return {
      items,
      page: {
        nextCursor: null,
        hasMore,
        limit: opts.limit,
        totalCount,
        offset,
      },
    };
  }

  async exportWinners(filters: WinnerListFilters): Promise<{
    body: string;
    filename: string;
    rowCount: number;
    contentType: string;
  }> {
    const limit = 100;
    const maxRows = 10_000;
    const all: WinnerListItemDTO[] = [];
    let page = 1;

    while (all.length < maxRows) {
      const { items, page: pageInfo } = await this.list({ page, limit, filters });
      all.push(...items);
      if (!pageInfo.hasMore) break;
      page += 1;
    }

    const rows = all.map((w) => ({
      customerName: w.customerName ?? "Guest",
      customerPhone: w.customerPhone ?? "",
      prizeName: w.prizeName ?? "Prize",
      prizeType: prizeTypeLabel(w.prizeType),
      campaignName: w.campaignName ?? "",
      couponCode: w.couponCode ?? "",
      wonAt: w.wonAt,
    }));

    const date = new Date().toISOString().slice(0, 10);
    return {
      body: buildWinnersCsv(rows),
      filename: `winners-${date}.csv`,
      rowCount: all.length,
      contentType: "text/csv; charset=utf-8",
    };
  }
}
