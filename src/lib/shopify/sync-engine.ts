import "server-only";
import { ShopifyApiError, type ShopifyClient } from "@/lib/shopify/client";
import { getShopifyForBusiness } from "@/lib/shopify/adapter";
import {
  claimNextSyncJob,
  completeSyncJob,
  failSyncJob,
  getSyncJob,
  getSyncStateWatermark,
  ingestOrdersBatch,
  requeueSyncJobForContinuation,
  startSyncJob,
  updateSyncProgress,
  upsertCollectionsBatch,
  upsertCustomersBatch,
  upsertDiscountsBatch,
  upsertInventoryBatch,
  upsertProductsBatch,
} from "@/lib/shopify/store";
import {
  normalizeCollection,
  normalizeCustomer,
  normalizeDiscount,
  normalizeInventoryLevel,
  normalizeProduct,
} from "@/lib/shopify/normalizers";
import { normalizeShopifyOrder } from "@/server/modules/shopify/normalizer";
import { createLogger, newCorrelationId } from "@/server/observability/logger";
import type { ShopifySyncJob, SyncResource } from "@/lib/shopify/types";

/**
 * The Shopify Sync Engine — the outbound pull layer.
 *
 * A job is driven start → (page → batch-upsert → persist-cursor)* → complete|fail.
 * Every page is persisted in ONE batch RPC (a JSONB array of up to PAGE_SIZE
 * rows), then its resume cursor + counters are persisted BEFORE fetching the
 * next page, so an interrupted run (deploy, timeout, crash) resumes from
 * `job.cursor` on the next scheduler tick — jobs are resumable by construction.
 *
 * Idempotency: every upsert lands on a tenant-scoped external-id key, so
 * re-processing a page (after a resume) is a no-op, never a duplicate.
 *
 * Errors:
 *   - 429 rate limit  → sleep for Retry-After, then continue the same page.
 *   - 401/403 auth    → surface reconnect need and fail the job; the shop is
 *                       NEVER auto-revoked here (only the app/uninstalled webhook
 *                       or an explicit merchant disconnect may disconnect).
 *   - anything else    → bubble to the job's retry/backoff (shopify_fail_sync_job).
 *
 * Bounded work per invocation: a single `after()` slice processes up to
 * MAX_PAGES_PER_SLICE pages then, if more remain, leaves the job `running` with
 * its cursor persisted for the next tick — keeping any one HTTP lifetime short.
 */

const PAGE_SIZE = 250;
const MAX_PAGES_PER_SLICE = 40; // ~10k records/slice; bounds one invocation
const MAX_RATE_LIMIT_SLEEP_MS = 10_000;

/** Per-resource wiring: REST path, JSON key, normalizer, batch upsert fn. */
interface ResourceSpec {
  path: string;
  key: string;
  countPath?: string;
  normalize: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Persist a whole page at once (one RPC per page, not per row). Returns count. */
  upsertBatch: (businessId: string, rows: unknown[]) => Promise<number>;
  /** Incremental sync supported (resource exposes updated_at_min). */
  incremental: boolean;
}

function specFor(resource: SyncResource): ResourceSpec | null {
  switch (resource) {
    case "products":
      return {
        path: "products",
        key: "products",
        countPath: "products",
        normalize: normalizeProduct,
        upsertBatch: upsertProductsBatch,
        incremental: true,
      };
    case "orders":
      return {
        path: "orders",
        key: "orders",
        countPath: "orders",
        normalize: (o) => normalizeShopifyOrder(o) as unknown as Record<string, unknown>,
        upsertBatch: ingestOrdersBatch,
        incremental: true,
      };
    case "customers":
      return {
        path: "customers",
        key: "customers",
        countPath: "customers",
        normalize: normalizeCustomer,
        upsertBatch: upsertCustomersBatch,
        incremental: true,
      };
    case "collections":
      // Custom collections only via this path; smart collections handled below.
      return {
        path: "custom_collections",
        key: "custom_collections",
        countPath: "custom_collections",
        normalize: (c) => normalizeCollection({ ...c, collection_type: "custom" }),
        upsertBatch: upsertCollectionsBatch,
        incremental: false,
      };
    case "discounts":
      return {
        path: "price_rules",
        key: "price_rules",
        countPath: "price_rules",
        normalize: normalizeDiscount,
        upsertBatch: upsertDiscountsBatch,
        incremental: false,
      };
    case "inventory":
      // Inventory levels require location scoping; handled specially in runner.
      return null;
    default:
      return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one job to completion (or to the end of this slice). Resolves the tenant
 * client, then paginates the resource, persisting the cursor after each page.
 * Never throws — terminal outcomes go through complete/fail RPCs so the job
 * table is always consistent.
 */
/**
 * Run one job to completion (or to the end of this slice). The job must ALREADY
 * be claimed (status='running') by the caller via `startSyncJob` — that atomic
 * claim is what prevents two workers advancing the same cursor. Resolves the
 * tenant client, paginates the resource, and persists the cursor after each
 * page. Never throws — terminal outcomes go through complete/fail RPCs so the
 * job table is always consistent.
 */
export async function runSyncJob(job: ShopifySyncJob): Promise<void> {
  const log = createLogger(newCorrelationId(), {
    layer: "sync-engine",
    businessId: job.business_id,
    resource: job.resource,
    jobId: job.id,
  });

  // Fan "all" out into one job per concrete resource (each enqueued separately).
  if (job.resource === "all") {
    await completeSyncJob(job.business_id, job.id);
    log.info("shopify.sync.all_expanded");
    return;
  }

  const tenant = await getShopifyForBusiness(job.business_id);
  if (!tenant) {
    await failSyncJob(job.business_id, job.id, "Store not connected or token unreadable");
    log.warn("shopify.sync.no_connection");
    return;
  }

  try {
    if (job.resource === "inventory") {
      await runInventory(job, tenant.client, log);
    } else {
      await runPaginated(job, tenant.client, log);
    }
  } catch (err) {
    if (err instanceof ShopifyApiError && err.isAuthError) {
      // A 401/403 here is transient more often than not — a token caught
      // mid-refresh, a brief scope hiccup, Shopify hiccuping. It does NOT mean
      // the merchant uninstalled. We surface the failure so the next run (or
      // the merchant) can react, but we NEVER flip the store to revoked here:
      // only the genuine `app/uninstalled` webhook or an explicit merchant
      // disconnect may disconnect a connected store.
      await failSyncJob(job.business_id, job.id, `Auth failed: ${err.message}`);
      log.error("shopify.sync.auth_failed", { status: err.status });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    await failSyncJob(job.business_id, job.id, message);
    log.error("shopify.sync.failed", { err: message });
  }
}

/**
 * Claim a specific queued job and run it, if we win the claim. Used by the
 * immediate-trigger path (`after()` in the trigger route). No-op if the job is
 * already being processed elsewhere.
 */
export async function claimAndRunJob(businessId: string, jobId: string): Promise<void> {
  const claimed = await startSyncJob(businessId, jobId);
  if (!claimed) return; // another worker/scheduler owns it
  const job = await getSyncJob(businessId, jobId);
  if (job) await runSyncJob(job);
}

/**
 * Scheduler drain: claim and run up to `maxJobs` due jobs across all tenants.
 * `claimNextSyncJob` atomically flips each to running (SKIP LOCKED), so this is
 * safe to run concurrently on multiple workers. Returns how many it processed.
 */
export async function drainDueJobs(maxJobs = 25): Promise<number> {
  let count = 0;
  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextSyncJob();
    if (!job) break;
    await runSyncJob(job);
    count += 1;
  }
  return count;
}

/** Standard cursor-paginated resource sync (products/orders/customers/…). */
async function runPaginated(
  job: ShopifySyncJob,
  client: ShopifyClient,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const spec = specFor(job.resource as SyncResource);
  if (!spec) {
    await completeSyncJob(job.business_id, job.id);
    return;
  }

  // Incremental sync starts from the stored watermark; initial/manual from 0.
  const updatedAtMin =
    spec.incremental && (job.mode === "incremental" || job.mode === "scheduled")
      ? await getSyncStateWatermark(job.business_id, job.resource as SyncResource)
      : null;

  // Estimate total for progress on the first slice (best-effort).
  let total = job.total ?? null;
  if (total == null && spec.countPath && !job.cursor) {
    try {
      total = await client.count(spec.countPath, updatedAtMin ? { updated_at_min: updatedAtMin } : {});
    } catch {
      total = null;
    }
  }

  let cursor = job.cursor;
  let processed = job.processed ?? 0;
  let failed = job.failed ?? 0;
  let newestUpdatedAt: string | null = null;

  for (let page = 0; page < MAX_PAGES_PER_SLICE; page++) {
    const pageResult = await fetchWithRateLimit(
      () =>
        client.list<Record<string, unknown>>(spec.path, spec.key, {
          limit: PAGE_SIZE,
          pageInfo: cursor,
          updatedAtMin: cursor ? null : updatedAtMin,
        }),
      log
    );

    // Normalize the whole page, then persist it in ONE batch RPC (not per row).
    // The scan for the newest updated_at runs over the normalized rows here so
    // the watermark advances exactly as before, minus 249 round-trips.
    const rows = pageResult.items.map((row) => {
      const normalized = spec.normalize(row);
      const u = row.updated_at;
      if (typeof u === "string" && (!newestUpdatedAt || u > newestUpdatedAt)) newestUpdatedAt = u;
      return normalized;
    });

    try {
      await spec.upsertBatch(job.business_id, rows);
      processed += rows.length;
    } catch (err) {
      // A batch commits its whole page or throws. Auth errors bubble to
      // runSyncJob (which never revokes the store); other errors fail the job
      // for retry. Pages are idempotent, so a retried page re-upserts harmlessly.
      if (err instanceof ShopifyApiError) throw err;
      failed += rows.length;
      log.warn("shopify.sync.page_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    cursor = pageResult.nextPageInfo;
    await updateSyncProgress(job.business_id, job.id, { processed, failed, cursor, total });

    if (!cursor) {
      // Fully drained — complete and advance the watermark.
      await completeSyncJob(job.business_id, job.id, newestUpdatedAt ?? new Date().toISOString());
      log.info("shopify.sync.completed", { processed, failed });
      return;
    }
  }

  // Slice budget exhausted with more pages remaining: leave it running with the
  // cursor persisted; the scheduler picks it up again next tick (resumable).
  log.info("shopify.sync.slice_yielded", { processed, failed, hasMore: true });
  await requeueForContinuation(job);
}

/**
 * Inventory sync: enumerate locations, then pull inventory_levels per location.
 * The resume cursor encodes `locIndex|pageInfo` so it's resumable across slices.
 */
async function runInventory(
  job: ShopifySyncJob,
  client: ShopifyClient,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const locations = await fetchWithRateLimit(
    () => client.list<{ id: number | string }>("locations", "locations", { limit: PAGE_SIZE }),
    log
  );
  const locationIds = locations.items.map((l) => String(l.id));

  let [startLoc, startCursor] = decodeInvCursor(job.cursor);
  let processed = job.processed ?? 0;
  let failed = job.failed ?? 0;
  let pages = 0;

  for (let li = startLoc; li < locationIds.length; li++) {
    let cursor: string | null = li === startLoc ? startCursor : null;
    do {
      const pageResult = await fetchWithRateLimit(
        () =>
          client.list<Record<string, unknown>>("inventory_levels", "inventory_levels", {
            limit: PAGE_SIZE,
            pageInfo: cursor,
            extra: cursor ? undefined : { location_ids: locationIds[li] },
          }),
        log
      );
      const invRows = pageResult.items.map((row) => normalizeInventoryLevel(row));
      try {
        await upsertInventoryBatch(job.business_id, invRows);
        processed += invRows.length;
      } catch (err) {
        if (err instanceof ShopifyApiError) throw err;
        failed += invRows.length;
        log.warn("shopify.sync.page_failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
      cursor = pageResult.nextPageInfo;
      await updateSyncProgress(job.business_id, job.id, {
        processed,
        failed,
        cursor: encodeInvCursor(li, cursor),
      });
      pages += 1;
      if (pages >= MAX_PAGES_PER_SLICE) {
        log.info("shopify.sync.slice_yielded", { processed, failed, hasMore: true });
        await requeueForContinuation(job);
        return;
      }
    } while (cursor);
  }

  await completeSyncJob(job.business_id, job.id, new Date().toISOString());
  log.info("shopify.sync.completed", { processed, failed });
}

/** Retry a fetch through one 429 by honoring Retry-After (bounded sleep). */
async function fetchWithRateLimit<T>(
  fn: () => Promise<T>,
  log: ReturnType<typeof createLogger>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ShopifyApiError && err.isRateLimit) {
      const ms = Math.min((err.retryAfterSeconds ?? 2) * 1000, MAX_RATE_LIMIT_SLEEP_MS);
      log.info("shopify.sync.rate_limited", { sleepMs: ms });
      await sleep(ms);
      return await fn();
    }
    throw err;
  }
}

/**
 * Re-arm a job that yielded mid-run so the scheduler reclaims it. The job keeps
 * its persisted cursor + counters and stays out of the failure/backoff path
 * (attempts unchanged) — this is a cooperative yield to bound one invocation.
 */
async function requeueForContinuation(job: ShopifySyncJob): Promise<void> {
  await requeueSyncJobForContinuation(job.business_id, job.id);
}

function encodeInvCursor(locIndex: number, pageInfo: string | null): string {
  return `${locIndex}|${pageInfo ?? ""}`;
}
function decodeInvCursor(cursor: string | null): [number, string | null] {
  if (!cursor) return [0, null];
  const idx = cursor.indexOf("|");
  if (idx === -1) return [0, null];
  const loc = Number(cursor.slice(0, idx));
  const pi = cursor.slice(idx + 1);
  return [Number.isFinite(loc) ? loc : 0, pi || null];
}
