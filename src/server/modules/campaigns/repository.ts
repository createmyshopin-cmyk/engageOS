import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { CampaignRow, CampaignStats } from "@/server/modules/campaigns/dto";

/**
 * CampaignRepository — tenant-scoped campaign reads. The list uses the
 * auto-scoped select builder with keyset pagination over (created_at, id);
 * per-campaign stats come from the existing `campaign_stats_for_business`
 * rollup via TenantRepository.campaignStats() (reused, not reimplemented).
 */

const LIST_COLUMNS =
  "id, name, slug, status, starts_at, ends_at, headline, banner_url, logo_url, created_at";

export class CampaignRepository extends Repository {
  constructor(private readonly tenantRepo: TenantRepository) {
    super(tenantRepo);
  }

  /**
   * Keyset-paginated campaign list, newest-first by (created_at, id). Fetches
   * limit + 1 to detect a further page. Optional exact status filter.
   */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
  }): Promise<CampaignRow[]> {
    let q = this.tenantRepo.select("campaigns", LIST_COLUMNS);

    if (opts.status) q = q.eq("status", opts.status);

    // Keyset: newest-first, so the next page is rows strictly "before" the
    // cursor tuple, tie-broken on id (mirrors the customers list idiom).
    if (opts.cursor) {
      q = q.or(
        `created_at.lt.${opts.cursor.ts},and(created_at.eq.${opts.cursor.ts},id.lt.${opts.cursor.id})`
      );
    }

    q = q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(opts.limit + 1);

    const { data, error } = await q;
    if (error) throw new Error(`campaigns.list failed: ${error.message}`);
    return (data ?? []) as unknown as CampaignRow[];
  }

  /** Per-campaign stats map from the event-sourced rollup (reused DAL method). */
  async statsByCampaign(): Promise<Map<string, CampaignStats>> {
    return this.tenantRepo.campaignStats();
  }
}
