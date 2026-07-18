import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { enqueueDueSyncs } from "@/lib/shopify/store";
import { drainDueJobs } from "@/lib/shopify/sync-engine";
import { topUpAllCouponDropPools } from "@/lib/shopify/coupon-drop-orchestrator";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The scheduler drains a bounded slice of the queue per invocation (each sync
// job itself yields after MAX_PAGES_PER_SLICE and re-queues), so no single tick
// runs long — but give headroom for the enqueue pass + a few job slices.
export const maxDuration = 300;

/**
 * GET /api/shopify/cron — the sync scheduler tick.
 *
 * Meant to be hit on a schedule (Vercel Cron / external pinger). Two phases:
 *   1. `enqueueDueSyncs` — a single set-based SQL pass enqueues one incremental
 *      job per (connected store, resource) whose watermark is stale, skipping
 *      any that already have an active job (no pile-up).
 *   2. `drainDueJobs` — atomically claims (SKIP LOCKED) and runs a bounded batch
 *      of due jobs. Each job persists its cursor and yields when its slice
 *      budget is spent, so the work is resumable across ticks and horizontally
 *      scalable across overlapping invocations.
 *
 * Auth: a shared secret, compared in constant time, accepted two ways so the
 * same endpoint works for both drivers:
 *   - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` (it cannot set a
 *     custom header), matched against `CRON_SECRET`.
 *   - An external pinger sends `x-cron-secret: <secret>`, matched against
 *     `SHOPIFY_CRON_SECRET`.
 * If neither secret is configured the route returns 503 (fail-closed, never
 * open). There is no tenant context here — the scheduler is a system worker;
 * every job it runs is already bound to its own business_id in the DB.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const log = createLogger(newCorrelationId(), { route: "shopify.cron" });

  const headerSecret = process.env.SHOPIFY_CRON_SECRET;
  const bearerSecret = process.env.CRON_SECRET;
  if (!headerSecret && !bearerSecret) {
    log.warn("shopify.cron.not_configured");
    return NextResponse.json({ ok: false, error: "cron not configured" }, { status: 503 });
  }

  const suppliedHeader = request.headers.get("x-cron-secret") ?? "";
  const suppliedBearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const authorized =
    (!!headerSecret && constantTimeEqual(suppliedHeader, headerSecret)) ||
    (!!bearerSecret && constantTimeEqual(suppliedBearer, bearerSecret));
  if (!authorized) {
    log.warn("shopify.cron.unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Optional overrides via query (?interval=minutes, ?max=jobs), bounded.
  const url = new URL(request.url);
  const interval = clampInt(url.searchParams.get("interval"), 60, 5, 1440);
  const maxJobs = clampInt(url.searchParams.get("max"), 25, 1, 100);

  try {
    const enqueued = await enqueueDueSyncs(interval);
    const processed = await drainDueJobs(maxJobs);
    // Daily sweep: refill any coupon_drop pool that has dropped below its
    // watermark. Best-effort — a failure here must not fail the sync tick.
    let poolsSwept = 0;
    try {
      poolsSwept = (await topUpAllCouponDropPools()).swept;
    } catch (err) {
      log.error("shopify.cron.pool_topup_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    log.info("shopify.cron.tick", { enqueued, processed, interval, maxJobs, poolsSwept });
    return NextResponse.json({ ok: true, enqueued, processed, poolsSwept });
  } catch (err) {
    log.error("shopify.cron.failed", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "scheduler error" }, { status: 500 });
  }
}

/** Length-safe constant-time string compare (avoids leaking via early return). */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}
