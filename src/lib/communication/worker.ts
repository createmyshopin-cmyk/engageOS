import "server-only";

import { adminClient } from "@/lib/db/rpc";
import { dispatchPendingCoupons } from "@/lib/communication/gateway";
import {
  claimNextCommunicationJob,
  finishCommunicationJob,
} from "@/lib/communication/outbox";
import { processCommunicationJob } from "@/lib/communication/dispatcher";

export interface CommunicationCronResult {
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsReclaimed: number;
  couponsReclaimed: number;
  birthdaysEnqueued: number;
  inactiveEnqueued: number;
  couponsDrained: { sent: number; failed: number };
}

/**
 * Drain the communication outbox: claim jobs with SKIP LOCKED, send templates,
 * and optionally run daily birthday / monthly inactive scans.
 */
export async function runCommunicationCron(opts: {
  maxJobs?: number;
  runBirthdayScan?: boolean;
  runInactiveScan?: boolean;
  drainCoupons?: boolean;
  inactiveDays?: number;
}): Promise<CommunicationCronResult> {
  const maxJobs = Math.min(Math.max(opts.maxJobs ?? 25, 1), 100);
  let jobsProcessed = 0;
  let jobsSucceeded = 0;
  let jobsFailed = 0;
  let jobsReclaimed = 0;
  let couponsReclaimed = 0;
  let birthdaysEnqueued = 0;
  let inactiveEnqueued = 0;
  let couponsSent = 0;
  let couponsFailed = 0;

  const { data: reclaimedJobs } = await adminClient().rpc(
    "communication_reclaim_stuck_jobs",
    { p_stale_minutes: 15 }
  );
  if (typeof reclaimedJobs === "number") jobsReclaimed = reclaimedJobs;

  const { data: reclaimedCoupons } = await adminClient().rpc("reclaim_stuck_wa_coupons", {
    p_stale_minutes: 15,
  });
  if (typeof reclaimedCoupons === "number") couponsReclaimed = reclaimedCoupons;

  if (opts.runBirthdayScan) {
    const { data, error } = await adminClient().rpc("communication_enqueue_birthdays", {
      p_run_date: new Date().toISOString().slice(0, 10),
    });
    if (!error && typeof data === "number") birthdaysEnqueued = data;
  }

  if (opts.runInactiveScan) {
    const { data, error } = await adminClient().rpc("communication_enqueue_inactive", {
      p_inactive_days: opts.inactiveDays ?? 30,
      p_limit: 200,
    });
    if (!error && typeof data === "number") inactiveEnqueued = data;
  }

  for (let i = 0; i < maxJobs; i += 1) {
    let job;
    try {
      job = await claimNextCommunicationJob();
    } catch (err) {
      console.error("communication claim failed:", err);
      break;
    }
    if (!job) break;

    jobsProcessed += 1;
    try {
      const { success, error, retryable = true } = await processCommunicationJob(job);
      await finishCommunicationJob(job.id, success, error ?? null, retryable);
      if (success) jobsSucceeded += 1;
      else jobsFailed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await finishCommunicationJob(job.id, false, message, true);
      } catch (finishErr) {
        console.error("communication finish failed:", finishErr);
      }
      jobsFailed += 1;
    }
  }

  if (opts.drainCoupons) {
    const businessIds = new Set<string>();

    const { data: wacrmTenants } = await adminClient()
      .from("business_integrations")
      .select("business_id")
      .eq("status", "connected");

    for (const row of wacrmTenants ?? []) {
      businessIds.add((row as { business_id: string }).business_id);
    }

    const { data: watiTenants } = await adminClient()
      .from("wati_integrations")
      .select("business_id")
      .eq("status", "connected");

    for (const row of watiTenants ?? []) {
      businessIds.add((row as { business_id: string }).business_id);
    }

    for (const businessId of businessIds) {
      const result = await dispatchPendingCoupons(businessId, 25);
      couponsSent += result.sent;
      couponsFailed += result.failed;
    }
  }

  return {
    jobsProcessed,
    jobsSucceeded,
    jobsFailed,
    jobsReclaimed,
    couponsReclaimed,
    birthdaysEnqueued,
    inactiveEnqueued,
    couponsDrained: { sent: couponsSent, failed: couponsFailed },
  };
}
