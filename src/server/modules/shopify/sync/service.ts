import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { SYNC_RESOURCES } from "@/lib/shopify/types";
import { ShopifySyncRepository } from "@/server/modules/shopify/sync/repository";
import {
  toConnectionHealthDTO,
  toResourceSyncStateDTO,
  toSyncJobDTO,
  type ConnectionHealthDTO,
  type SyncJobDTO,
  type SyncOverviewDTO,
  type TriggerResultDTO,
} from "@/server/modules/shopify/sync/dto";

/**
 * ShopifySyncService — business logic for the merchant sync-control surface.
 *
 * Read paths assemble the dashboard bundle (health + per-resource state + recent
 * jobs). The write path (trigger) decides WHICH resources to enqueue (full
 * fan-out vs. a selective subset) and enqueues them idempotently; it does NOT
 * run the jobs itself — the controller schedules background execution after the
 * response so no HTTP request is ever held open on a long-running pull.
 *
 * Tenancy arrives as a constructor argument, so this service cannot mis-scope.
 */
export class ShopifySyncService extends Service {
  private readonly repo: ShopifySyncRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new ShopifySyncRepository(tenant);
  }

  /** Connection health only (dashboard header / polling). */
  async health(): Promise<ConnectionHealthDTO> {
    const row = await this.repo.connectionHealth();
    return toConnectionHealthDTO(
      row ?? {
        connected: false,
        shop_domain: null,
        status: null,
        installed_at: null,
        webhooks_24h: null,
        active_job: null,
        last_error: null,
      }
    );
  }

  /** The full sync dashboard payload in one round of parallel reads. */
  async overview(): Promise<SyncOverviewDTO> {
    const [health, resources, recentJobs] = await Promise.all([
      this.health(),
      this.repo.syncStatus(),
      this.repo.recentJobs(20),
    ]);
    return {
      health,
      resources: resources.map(toResourceSyncStateDTO),
      recentJobs: recentJobs.map(toSyncJobDTO),
    };
  }

  /** Recent sync jobs (logs), newest first. */
  async jobs(limit: number): Promise<SyncJobDTO[]> {
    const rows = await this.repo.recentJobs(limit);
    return rows.map(toSyncJobDTO);
  }

  /**
   * Enqueue a manual/incremental sync for the requested resources (or all of
   * them when none are named). Idempotent per (business, resource): if a resource
   * already has an active job, its existing id comes back instead of a duplicate.
   * Returns the enqueued job ids so the controller can drive them in the
   * background.
   */
  async trigger(input: {
    resources?: string[];
    mode?: "manual" | "incremental";
  }): Promise<TriggerResultDTO> {
    const mode = input.mode ?? "manual";
    const targets =
      input.resources && input.resources.length
        ? // De-dupe + preserve the canonical resource order.
          SYNC_RESOURCES.filter((r) => input.resources!.includes(r))
        : SYNC_RESOURCES;

    const enqueued: TriggerResultDTO["enqueued"] = [];
    for (const resource of targets) {
      const jobId = await this.repo.createJob(resource, mode, "merchant");
      enqueued.push({ resource, jobId });
    }
    this.logger.info("shopify.sync.triggered", {
      mode,
      resources: targets,
      jobs: enqueued.map((e) => e.jobId).filter(Boolean).length,
    });
    return { enqueued, mode };
  }
}
