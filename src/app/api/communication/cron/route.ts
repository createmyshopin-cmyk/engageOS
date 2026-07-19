import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runCommunicationCron } from "@/lib/communication/worker";
import { createLogger, newCorrelationId } from "@/server/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/communication/cron — drain communication_dispatch_jobs and run
 * scheduled scans (birthdays, inactive win-back). Auth matches shopify/cron.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const log = createLogger(newCorrelationId(), { route: "communication.cron" });

  const headerSecret = process.env.SHOPIFY_CRON_SECRET;
  const bearerSecret = process.env.CRON_SECRET;
  if (!headerSecret && !bearerSecret) {
    log.warn("communication.cron.not_configured");
    return NextResponse.json({ ok: false, error: "cron not configured" }, { status: 503 });
  }

  const suppliedHeader = request.headers.get("x-cron-secret") ?? "";
  const suppliedBearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const authorized =
    (!!headerSecret && constantTimeEqual(suppliedHeader, headerSecret)) ||
    (!!bearerSecret && constantTimeEqual(suppliedBearer, bearerSecret));
  if (!authorized) {
    log.warn("communication.cron.unauthorized");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const maxJobs = clampInt(url.searchParams.get("max"), 25, 1, 100);
  const inactiveDays = clampInt(url.searchParams.get("inactiveDays"), 30, 7, 180);
  const hourUtc = new Date().getUTCHours();

  try {
    const result = await runCommunicationCron({
      maxJobs,
      runBirthdayScan: hourUtc === 6,
      runInactiveScan: hourUtc === 7 && new Date().getUTCDate() === 1,
      drainCoupons: true,
      inactiveDays,
    });

    log.info("communication.cron.tick", { maxJobs, inactiveDays, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.error("communication.cron.failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "scheduler error" }, { status: 500 });
  }
}

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
