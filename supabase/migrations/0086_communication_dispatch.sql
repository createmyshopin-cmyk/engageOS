-- =============================================================
-- EngageOS — Migration 0086: Communication dispatch outbox
--
-- Durable job queue for event-driven WhatsApp messaging beyond
-- synchronous coupon delivery. Processed by /api/communication/cron.
-- =============================================================

create table if not exists communication_rules (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  event_type        text not null,
  enabled           boolean not null default false,
  template_name     text,
  template_language text not null default 'en',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id, event_type)
);

create index if not exists communication_rules_business_idx
  on communication_rules (business_id);

create table if not exists communication_dispatch_jobs (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  event_type   text not null,
  payload      jsonb not null default '{}',
  status       text not null default 'queued'
               check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts     int not null default 0,
  max_attempts int not null default 5,
  next_run_at  timestamptz not null default now(),
  dedup_key    text,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists communication_dispatch_jobs_dedup_active_idx
  on communication_dispatch_jobs (business_id, dedup_key)
  where dedup_key is not null and status in ('queued', 'running');

create index if not exists communication_dispatch_jobs_due_idx
  on communication_dispatch_jobs (status, next_run_at)
  where status = 'queued';

drop trigger if exists communication_rules_set_updated_at on communication_rules;
create trigger communication_rules_set_updated_at
  before update on communication_rules for each row execute function set_updated_at();

drop trigger if exists communication_dispatch_jobs_set_updated_at on communication_dispatch_jobs;
create trigger communication_dispatch_jobs_set_updated_at
  before update on communication_dispatch_jobs for each row execute function set_updated_at();

-- ---------- communication_enqueue_job ----------
create or replace function communication_enqueue_job(
  p_business_id uuid,
  p_event_type  text,
  p_payload     jsonb default '{}',
  p_dedup_key   text default null,
  p_run_at      timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_dedup_key is not null then
    select id into v_id
      from communication_dispatch_jobs
     where business_id = p_business_id
       and dedup_key = p_dedup_key
       and status in ('queued', 'running');
    if found then
      return v_id;
    end if;
  end if;

  insert into communication_dispatch_jobs (
    business_id, event_type, payload, dedup_key, next_run_at
  ) values (
    p_business_id,
    p_event_type,
    coalesce(p_payload, '{}'),
    p_dedup_key,
    coalesce(p_run_at, now())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function communication_enqueue_job(uuid, text, jsonb, text, timestamptz)
  from public, anon, authenticated;

-- ---------- communication_claim_next_job ----------
create or replace function communication_claim_next_job()
returns communication_dispatch_jobs
language plpgsql security definer set search_path = public as $$
declare
  v_job communication_dispatch_jobs;
begin
  select * into v_job
    from communication_dispatch_jobs
   where status = 'queued'
     and next_run_at <= now()
     and attempts < max_attempts
   order by next_run_at asc, created_at asc
   for update skip locked
   limit 1;

  if not found then
    return null;
  end if;

  update communication_dispatch_jobs
     set status = 'running',
         attempts = attempts + 1,
         updated_at = now()
   where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function communication_claim_next_job()
  from public, anon, authenticated;

-- ---------- communication_finish_job ----------
create or replace function communication_finish_job(
  p_job_id  uuid,
  p_success boolean,
  p_error   text default null
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

  if v_job.attempts >= v_job.max_attempts then
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

revoke execute on function communication_finish_job(uuid, boolean, text)
  from public, anon, authenticated;

-- ---------- Subscribe to universal events (loyalty, orders) ----------
create or replace function communication_on_stream_event()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_type text;
begin
  if new.customer_id is null then
    return new;
  end if;

  v_event_type := case new.event_name
    when 'loyalty.points.earned' then 'loyalty.points_added'
    when 'loyalty.tier.upgraded' then 'tier.upgraded'
    when 'order.placed' then 'purchase.completed'
    else null
  end;

  if v_event_type is null then
    return new;
  end if;

  perform communication_enqueue_job(
    new.business_id,
    v_event_type,
    jsonb_build_object(
      'customerId', new.customer_id,
      'sourceEventId', new.id,
      'streamPayload', coalesce(new.payload, '{}')
    ),
    'stream:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists communication_stream_event_enqueue on events;
create trigger communication_stream_event_enqueue
  after insert on events
  for each row execute function communication_on_stream_event();

-- ---------- Daily birthday scan ----------
create or replace function communication_enqueue_birthdays(
  p_run_date date default current_date
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select c.business_id, c.id as customer_id, c.phone, c.name
      from customers c
      join business_integrations bi
        on bi.business_id = c.business_id
       and bi.status = 'connected'
     where c.deleted_at is null
       and c.birthday is not null
       and c.wa_opt_out = false
       and c.phone is not null
       and extract(month from c.birthday) = extract(month from p_run_date)
       and extract(day from c.birthday) = extract(day from p_run_date)
  loop
    perform communication_enqueue_job(
      r.business_id,
      'birthday.today',
      jsonb_build_object(
        'customerId', r.customer_id,
        'phone', r.phone,
        'customerName', r.name
      ),
      'birthday:' || r.customer_id::text || ':' || p_run_date::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function communication_enqueue_birthdays(date)
  from public, anon, authenticated;

-- ---------- Inactive customer win-back scan ----------
create or replace function communication_enqueue_inactive(
  p_inactive_days int default 30,
  p_limit         int default 200
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  r record;
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_inactive_days, 7));
begin
  for r in
    select c.business_id, c.id as customer_id, c.phone, c.name
      from customers c
      join business_integrations bi
        on bi.business_id = c.business_id
       and bi.status = 'connected'
     where c.deleted_at is null
       and c.wa_opt_out = false
       and c.phone is not null
       and not exists (
         select 1 from events e
          where e.customer_id = c.id
            and e.occurred_at >= v_cutoff
       )
       and not exists (
         select 1 from customer_events ce
          where ce.customer_id = c.id
            and ce.created_at >= v_cutoff
       )
     order by c.updated_at asc nulls first
     limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    perform communication_enqueue_job(
      r.business_id,
      'customer.inactive',
      jsonb_build_object(
        'customerId', r.customer_id,
        'phone', r.phone,
        'customerName', r.name,
        'inactiveDays', p_inactive_days
      ),
      'inactive:' || r.customer_id::text || ':' || to_char(current_date, 'YYYY-MM')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function communication_enqueue_inactive(int, int)
  from public, anon, authenticated;

alter table communication_rules enable row level security;
alter table communication_dispatch_jobs enable row level security;

revoke all on communication_rules from anon, authenticated;
revoke all on communication_dispatch_jobs from anon, authenticated;
