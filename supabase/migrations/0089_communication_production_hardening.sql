-- =============================================================
-- EngageOS — Migration 0089: Production hardening
-- - Stuck dispatch job reclaim
-- - Atomic coupon send claim (wa_status = sending)
-- - Atomic WA quota reservation
-- - Non-retryable job failures
-- - Broadcast dedup index
-- =============================================================

-- ---------- wa_status: add 'sending' for in-flight coupon delivery ----------
alter table coupons drop constraint if exists coupons_wa_status_check;
alter table coupons add constraint coupons_wa_status_check
  check (wa_status in ('pending', 'sending', 'sent', 'delivered', 'read', 'failed'));

-- ---------- Reclaim coupons stuck in 'sending' ----------
create or replace function reclaim_stuck_wa_coupons(
  p_stale_minutes int default 15
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update coupons
     set wa_status = 'pending',
         updated_at = now()
   where wa_status = 'sending'
     and updated_at < now() - make_interval(mins => greatest(p_stale_minutes, 5));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function reclaim_stuck_wa_coupons(int)
  from public, anon, authenticated;

-- ---------- Atomically claim a pending coupon for outbound send ----------
create or replace function claim_coupon_wa_send(
  p_business_id uuid,
  p_coupon_id   uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update coupons
     set wa_status = 'sending',
         wa_attempts = wa_attempts + 1,
         updated_at = now()
   where id = p_coupon_id
     and business_id = p_business_id
     and wa_status = 'pending'
  returning id into v_id;

  return v_id is not null;
end;
$$;

revoke execute on function claim_coupon_wa_send(uuid, uuid)
  from public, anon, authenticated;

-- ---------- Atomic quota reservation (returns false when exhausted) ----------
create or replace function try_reserve_wa_quota(
  p_business_id uuid,
  p_count       int default 1
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_reserved int;
begin
  update businesses
     set wa_messages_sent = wa_messages_sent + greatest(p_count, 0)
   where id = p_business_id
     and wa_messages_sent + greatest(p_count, 0) <= wa_messages_quota
  returning 1 into v_reserved;

  return v_reserved is not null;
end;
$$;

revoke execute on function try_reserve_wa_quota(uuid, int)
  from public, anon, authenticated;

-- ---------- Reclaim stuck communication dispatch jobs ----------
create or replace function communication_reclaim_stuck_jobs(
  p_stale_minutes int default 15
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update communication_dispatch_jobs
     set status = 'queued',
         updated_at = now()
   where status = 'running'
     and updated_at < now() - make_interval(mins => greatest(p_stale_minutes, 5));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function communication_reclaim_stuck_jobs(int)
  from public, anon, authenticated;

-- ---------- finish_job: honour non-retryable failures ----------
drop function if exists communication_finish_job(uuid, boolean, text);

create or replace function communication_finish_job(
  p_job_id    uuid,
  p_success   boolean,
  p_error     text default null,
  p_retryable boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_job communication_dispatch_jobs;
  v_backoff interval;
begin
  select * into v_job from communication_dispatch_jobs where id = p_job_id;
  if not found then
    return;
  end if;

  if p_success then
    update communication_dispatch_jobs
       set status = 'completed',
           last_error = null,
           completed_at = now(),
           updated_at = now()
     where id = p_job_id;
    return;
  end if;

  if not p_retryable or v_job.attempts >= v_job.max_attempts then
    update communication_dispatch_jobs
       set status = 'failed',
           last_error = left(coalesce(p_error, 'unknown error'), 500),
           updated_at = now()
     where id = p_job_id;
    return;
  end if;

  v_backoff := least(interval '1 hour', (interval '1 minute') * power(2, greatest(v_job.attempts - 1, 0)));

  update communication_dispatch_jobs
     set status = 'queued',
         last_error = left(coalesce(p_error, 'unknown error'), 500),
         next_run_at = now() + v_backoff,
         updated_at = now()
   where id = p_job_id;
end;
$$;

revoke execute on function communication_finish_job(uuid, boolean, text, boolean)
  from public, anon, authenticated;

-- ---------- Broadcast ledger dedup ----------
create unique index if not exists whatsapp_broadcasts_business_wacrm_id_idx
  on whatsapp_broadcasts (business_id, wacrm_broadcast_id);
