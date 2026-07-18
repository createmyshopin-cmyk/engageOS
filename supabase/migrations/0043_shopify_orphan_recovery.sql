-- =============================================================
-- 0043_shopify_orphan_recovery.sql — reclaim stale 'running' sync jobs
--
-- Problem: on serverless (Vercel), a job that is atomically claimed to
-- status='running' can be abandoned if its invocation dies mid-slice (deploy,
-- timeout, OOM, hard crash). 0040's `shopify_claim_next_sync_job` only ever
-- picks up status='queued', so such a job sits 'running' forever — and the
-- partial unique index `(business_id, resource) where status in
-- ('queued','running')` then blocks any NEW job for that (business, resource)
-- from being enqueued. The whole resource is wedged with no self-healing path.
--
-- Fix: treat a job that has been 'running' longer than a stale threshold as
-- abandoned and reclaim it. Because every slice persists its resume cursor +
-- counters BEFORE advancing (0040 design), a reclaim is a safe CONTINUATION —
-- it resumes from `cursor`, so `attempts` is NOT bumped (this is not a failure).
-- SKIP LOCKED still guarantees no two workers grab the same row, so a job whose
-- invocation is genuinely still alive and mid-write is protected by the row
-- lock; only truly idle 'running' rows past the threshold are reclaimed.
--
-- STRICTLY ADDITIVE: only replaces the body of one existing RPC
-- (`shopify_claim_next_sync_job`) — same signature, same return type, same
-- revoke. No table/index/policy changed. Backward compatible: queued jobs are
-- still claimed first and identically.
-- =============================================================

-- Stale threshold: a slice is bounded to well under maxDuration=300s, and a
-- job re-queues itself between slices, so a row that has been 'running' for 15
-- minutes without progress is abandoned with very high confidence.
create or replace function shopify_claim_next_sync_job()
returns shopify_sync_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job         shopify_sync_jobs;
  v_stale_after constant interval := interval '15 minutes';
begin
  -- Claim the oldest DUE job: either a queued job whose timers have elapsed, or
  -- a 'running' job abandoned past the stale threshold (started_at is set on the
  -- claim, so it is the age of the current run). Queued jobs sort first at equal
  -- age via the status key, preserving prior behavior when nothing is stale.
  select * into v_job
    from shopify_sync_jobs
   where (
           status = 'queued'
           and (next_run_at is null or next_run_at <= now())
           and (scheduled_at is null or scheduled_at <= now())
         )
      or (
           status = 'running'
           and started_at is not null
           and started_at <= now() - v_stale_after
         )
   order by (status = 'queued') desc, created_at asc
   for update skip locked
   limit 1;

  if v_job.id is null then
    return null;
  end if;

  -- Claim/renew: (re)assert running and reset started_at to now so the stale
  -- clock restarts for THIS slice. Preserve cursor + counters (resumable).
  -- attempts is left untouched — a reclaim is a continuation, not a failure.
  update shopify_sync_jobs
     set status      = 'running',
         started_at  = now(),
         error       = null,
         next_run_at = null
   where id = v_job.id
   returning * into v_job;
  return v_job;
end $$;
revoke execute on function shopify_claim_next_sync_job()
  from public, anon, authenticated;
