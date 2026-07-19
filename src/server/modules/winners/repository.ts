import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { WinnerListRow, WinnersSummaryRow } from "@/server/modules/winners/dto";
import type { WinnerListFilters } from "@/server/modules/winners/validator";
import { dateRangeToTimestamps } from "@/server/modules/winners/validator";

export class WinnersRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async summary(wonFrom: string | null, wonTo: string | null): Promise<WinnersSummaryRow | null> {
    const range = dateRangeToTimestamps(wonFrom, wonTo);
    return this.rpcOne<WinnersSummaryRow>("winners_summary", {
      p_business_id: this.businessId,
      p_from: range.from,
      p_to: range.to,
    });
  }

  async list(opts: {
    limit: number;
    offset: number;
    filters: WinnerListFilters;
  }): Promise<WinnerListRow[]> {
    const range = dateRangeToTimestamps(opts.filters.wonFrom, opts.filters.wonTo);
    return this.rpcRows<WinnerListRow>("merchant_list_winners", {
      p_business_id: this.businessId,
      p_limit: opts.limit,
      p_offset: opts.offset,
      p_search: opts.filters.search,
      p_prize_category: opts.filters.prizeCategory,
      p_campaign_id: opts.filters.campaignId,
      p_from: range.from,
      p_to: range.to,
      p_campaign_scope: opts.filters.campaignScope,
    });
  }
}
