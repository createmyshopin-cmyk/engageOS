import "server-only";

import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { BroadcastListRow } from "@/server/modules/marketing/dto";

/**
 * MarketingRepository — tenant-scoped reads for launched broadcast history.
 * Meta/wacrm broadcast ledger was removed; WATI broadcasts are managed in the
 * WATI console. This feed stays read-only and returns an empty list until a
 * WATI-backed ledger is added.
 */

export class MarketingRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async list(_opts: {
    limit: number;
    cursor: Cursor | null;
  }): Promise<BroadcastListRow[]> {
    return [];
  }
}
