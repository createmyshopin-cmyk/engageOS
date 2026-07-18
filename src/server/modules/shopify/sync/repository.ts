import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type {
  ConnectionHealthRow,
  ResourceSyncStateRow,
  SyncJobRow,
} from "@/server/modules/shopify/sync/dto";

/**
 * ShopifySyncRepository — tenant-scoped data access for the sync-control surface.
 *
 * Every call routes through the bound TenantRepository and passes the session's
 * business_id to a SECURITY DEFINER RPC, so a merchant can only ever observe or
 * act on their own store. This repository issues NO raw SQL and never reads the
 * encrypted token column — the read-model RPCs project display-safe fields only.
 *
 * The three read RPCs each return a single `jsonb` value (an object for health,
 * an array for state/jobs), so they go through `rpcScalar`, not `rpcSelect`
 * (which would wrap the already-aggregated JSON in an extra array).
 */
export class ShopifySyncRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /** Connection + webhook + active-job health snapshot (single jsonb object). */
  async connectionHealth(): Promise<ConnectionHealthRow | null> {
    return this.tenant.rpcScalar<ConnectionHealthRow>("shopify_connection_health", {
      p_business_id: this.businessId,
    });
  }

  /** Per-resource sync watermarks + status (jsonb array). */
  async syncStatus(): Promise<ResourceSyncStateRow[]> {
    const rows = await this.tenant.rpcScalar<ResourceSyncStateRow[]>("shopify_sync_status", {
      p_business_id: this.businessId,
    });
    return rows ?? [];
  }

  /** Most-recent sync jobs, newest first (jsonb array). */
  async recentJobs(limit: number): Promise<SyncJobRow[]> {
    const rows = await this.tenant.rpcScalar<SyncJobRow[]>("shopify_recent_sync_jobs", {
      p_business_id: this.businessId,
      p_limit: limit,
    });
    return rows ?? [];
  }

  /**
   * Enqueue a sync job idempotently. The RPC guarantees at most one active job
   * per (business, resource) and returns the existing one on conflict, so a
   * merchant hammering "Sync now" can never spawn duplicate concurrent pulls.
   * Returns the job id (new or pre-existing).
   */
  async createJob(
    resource: string,
    mode: string,
    triggeredBy: string
  ): Promise<string | null> {
    return this.tenant.rpcScalar<string>("shopify_create_sync_job", {
      p_business_id: this.businessId,
      p_resource: resource,
      p_mode: mode,
      p_triggered_by: triggeredBy,
      p_scheduled_at: null,
    });
  }
}
