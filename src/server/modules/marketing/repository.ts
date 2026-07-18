import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { BroadcastListRow } from "@/server/modules/marketing/dto";

/**
 * MarketingRepository — tenant-scoped reads over the whatsapp_broadcasts launch
 * ledger. Uses the auto-scoped select builder with keyset pagination over
 * (created_at, id) — the natural, indexed order (whatsapp_broadcasts_business_idx).
 * Read-only: this repository never launches or writes broadcasts (the WhatsApp
 * composer / webhook path own all writes).
 */

const LIST_COLUMNS =
  "id, name, template_name, template_language, segment, status, " +
  "total_recipients, accepted, rejected, sent_count, delivered_count, " +
  "read_count, failed_count, created_at";

export class MarketingRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /**
   * Keyset-paginated broadcast list, newest-first by (created_at, id). Fetches
   * limit + 1 to detect a further page. Same idiom as the orders/customers lists.
   */
  async list(opts: { limit: number; cursor: Cursor | null }): Promise<BroadcastListRow[]> {
    let q = this.tenant.select("whatsapp_broadcasts", LIST_COLUMNS);

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
    if (error) throw new Error(`marketing.list failed: ${error.message}`);
    return (data ?? []) as unknown as BroadcastListRow[];
  }
}
