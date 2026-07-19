-- =============================================================
-- EngageOS — Migration 0088: Priority-based communication dispatch
--
-- Higher priority jobs are claimed first (then FIFO by next_run_at).
-- 0 = lowest, 100 = highest. Default 50.
-- =============================================================

alter table communication_dispatch_jobs
  add column if not exists priority int not null default 50
  check (priority between 0 and 100);

drop index if exists communication_dispatch_jobs_due_idx;
create index if not exists communication_dispatch_jobs_priority_due_idx
  on communication_dispatch_jobs (status, priority desc, next_run_at asc)
  where status = 'queued';

drop function if exists communication_enqueue_job(uuid, text, jsonb, text, timestamptz);

create or replace function communication_enqueue_job(
  p_business_id uuid,
  p_event_type  text,
  p_payload     jsonb default '{}',
  p_dedup_key   text default null,
  p_run_at      timestamptz default now(),
  p_priority    int default 50
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_priority int := greatest(0, least(coalesce(p_priority, 50), 100));
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
    business_id, event_type, payload, dedup_key, next_run_at, priority
  ) values (
    p_business_id,
    p_event_type,
    coalesce(p_payload, '{}'),
    p_dedup_key,
    coalesce(p_run_at, now()),
    v_priority
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function communication_enqueue_job(uuid, text, jsonb, text, timestamptz, int)
  from public, anon, authenticated;

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
   order by priority desc, next_run_at asc, created_at asc
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

create or replace function communication_on_stream_event()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_event_type text;
  v_priority int := 50;
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

  v_priority := case v_event_type
    when 'tier.upgraded' then 70
    when 'purchase.completed' then 65
    else 60
  end;

  perform communication_enqueue_job(
    new.business_id,
    v_event_type,
    jsonb_build_object(
      'customerId', new.customer_id,
      'sourceEventId', new.id,
      'streamPayload', coalesce(new.payload, '{}')
    ),
    'stream:' || new.id::text,
    now(),
    v_priority
  );

  return new;
end;
$$;

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
      'birthday:' || r.customer_id::text || ':' || p_run_date::text,
      now(),
      30
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
      'inactive:' || r.customer_id::text || ':' || to_char(current_date, 'YYYY-MM'),
      now(),
      20
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
