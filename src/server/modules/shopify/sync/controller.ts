import "server-only";
import { after, type NextResponse } from "next/server";
import { Controller } from "@/server/core/Controller";
import { requireScope } from "@/server/auth/guard";
import { tenantRepositoryFor, type RequestContext } from "@/server/http/context";
import { ok } from "@/server/http/responses";
import { claimAndRunJob } from "@/lib/shopify/sync-engine";
import { createLogger, newCorrelationId } from "@/server/observability/logger";
import { ShopifySyncService } from "@/server/modules/shopify/sync/service";
import type { TriggerSyncBody, ListSyncJobsQuery } from "@/server/modules/shopify/sync/validator";

/**
 * ShopifySyncController — the merchant-facing sync-control surface.
 *
 * Derives the tenant from the principal (never from input), enforces scope, and
 * envelopes each result. Reads (health/overview/jobs) need `read`; triggering a
 * sync needs `write`. No SQL, no business rules — those live in the service and
 * the DB RPCs respectively.
 *
 * The trigger endpoint enqueues jobs synchronously (so the response reports the
 * job ids) but runs them AFTER the response via `after()`, honoring the "no
 * long-running HTTP request" rule. Each job is claimed atomically before it
 * runs, so this background kick can never double-process a job the scheduler is
 * already draining.
 */
export class ShopifySyncController extends Controller {
  private readonly tenant = tenantRepositoryFor(this.principal());
  private readonly service: ShopifySyncService;

  constructor(ctx: RequestContext) {
    super(ctx);
    this.service = new ShopifySyncService(ctx, this.businessId, this.tenant);
  }

  /** GET — connection + webhook + active-job health snapshot. */
  async health(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.health();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  /** GET — full sync dashboard bundle (health + per-resource state + jobs). */
  async overview(): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.overview();
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  /** GET — recent sync-job history (logs). */
  async jobs(query: ListSyncJobsQuery): Promise<NextResponse> {
    requireScope(this.principal(), "read");
    const data = await this.service.jobs(query.limit ?? 20);
    return ok(data, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }

  /**
   * POST — trigger a manual/incremental sync (full or selective). Enqueues the
   * jobs, returns their ids, then drives them in the background after the
   * response so the merchant's request returns immediately.
   */
  async trigger(body: TriggerSyncBody): Promise<NextResponse> {
    requireScope(this.principal(), "write");
    const result = await this.service.trigger(body);
    const businessId = this.businessId;

    // Kick each freshly-enqueued job in the background. `claimAndRunJob` atomically
    // claims (queued→running) first and no-ops if the scheduler already owns it,
    // so this never races the cron drain into a double cursor-advance.
    const jobIds = result.enqueued.map((e) => e.jobId).filter((id): id is string => !!id);
    if (jobIds.length) {
      after(async () => {
        const bg = createLogger(newCorrelationId(), {
          route: "shopify.sync.trigger.bg",
          businessId,
        });
        for (const jobId of jobIds) {
          try {
            await claimAndRunJob(businessId, jobId);
          } catch (err) {
            bg.error("shopify.sync.trigger.job_failed", {
              jobId,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      });
    }

    return ok(result, { correlationId: this.ctx.correlationId, version: this.ctx.version });
  }
}
