-- =============================================================
-- EngageOS CDP — Migration 0037: Dynamic Segmentation
--
-- Phase 1 of the CDP foundation. Adds customer segments (dynamic rule-
-- based or manual) and segment membership. Membership can be maintained
-- manually or by assign_customer_to_segments(), which evaluates simple
-- built-in predicates against customer_analytics (0036).
--
-- The `definition` JSONB holds a rule tree for future rule-engine
-- evaluation; Phase 1 ships a small set of built-in predicates keyed by
-- segment slug so segments are usable immediately without a full engine.
--
-- STRICTLY ADDITIVE. RLS default-deny, service-role only.
-- =============================================================

create table if not exists customer_segments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  slug         text not null check (slug ~ '^[a-z0-9_-]{1,60}$'),
  description  text,
  type         text not null default 'dynamic' check (type in ('dynamic','manual')),
  is_active    boolean not null default true,
  definition   jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, slug)
);
create index if not exists customer_segments_business_idx
  on customer_segments (business_id);
drop trigger if exists customer_segments_updated_at on customer_segments;
create trigger customer_segments_updated_at
  before update on customer_segments
  for each row execute function set_updated_at();

create table if not exists customer_segment_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  segment_id   uuid not null references customer_segments(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete cascade,
  source       text not null default 'rule' check (source in ('rule','manual')),
  added_at     timestamptz not null default now(),
  unique (segment_id, customer_id)
);
create index if not exists customer_segment_members_segment_idx
  on customer_segment_members (segment_id);
create index if not exists customer_segment_members_customer_idx
  on customer_segment_members (business_id, customer_id);

alter table customer_segments        enable row level security;
alter table customer_segment_members enable row level security;
revoke all on customer_segments        from anon, authenticated;
revoke all on customer_segment_members from anon, authenticated;

-- =============================================================
-- RPCs — SECURITY DEFINER, service-role only.
-- =============================================================

create or replace function merchant_create_segment(
  p_business_id uuid,
  p_name        text,
  p_slug        text,
  p_type        text default 'dynamic',
  p_description text default null,
  p_definition  jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into customer_segments (business_id, name, slug, type, description, definition)
  values (p_business_id, trim(p_name), lower(trim(p_slug)),
          coalesce(p_type, 'dynamic'),
          nullif(trim(coalesce(p_description, '')), ''),
          coalesce(p_definition, '{}'::jsonb))
  on conflict (business_id, slug) do update
    set name        = excluded.name,
        type        = excluded.type,
        description  = excluded.description,
        definition   = excluded.definition
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function merchant_create_segment(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;

create or replace function merchant_add_segment_member(
  p_business_id uuid,
  p_segment_id  uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from customer_segments
                  where id = p_segment_id and business_id = p_business_id) then
    raise exception 'segment % not owned by business %', p_segment_id, p_business_id;
  end if;
  if not exists (select 1 from customers
                  where id = p_customer_id and business_id = p_business_id) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  insert into customer_segment_members (business_id, segment_id, customer_id, source)
  values (p_business_id, p_segment_id, p_customer_id, 'manual')
  on conflict (segment_id, customer_id) do nothing;
end $$;

revoke execute on function merchant_add_segment_member(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function merchant_remove_segment_member(
  p_business_id uuid,
  p_segment_id  uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from customer_segment_members
   where business_id = p_business_id
     and segment_id = p_segment_id
     and customer_id = p_customer_id;
end $$;

revoke execute on function merchant_remove_segment_member(uuid, uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- assign_customer_to_segments — evaluate the built-in dynamic segments
-- for one customer against customer_analytics and sync 'rule' membership.
-- Built-in slugs (created on demand as dynamic segments):
--   new_customer    — first seen within 30 days, < 2 plays
--   inactive        — last seen > 60 days ago
--   high_value      — >= 3 redemptions OR health_score >= 60
--   coupon_hunter   — plays >= 3 but redemptions = 0
-- Manual memberships (source='manual') are never touched.
-- =============================================================
create or replace function assign_customer_to_segments(
  p_business_id uuid,
  p_customer_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a customer_analytics%rowtype;
  v_slug   text;
  v_match  boolean;
  v_seg_id uuid;
  builtins constant text[] := array['new_customer','inactive','high_value','coupon_hunter'];
begin
  if not exists (
    select 1 from customers where id = p_customer_id and business_id = p_business_id
  ) then
    raise exception 'customer % not owned by business %', p_customer_id, p_business_id;
  end if;

  select * into a from customer_analytics
   where customer_id = p_customer_id and business_id = p_business_id;
  if not found then
    return;  -- no analytics yet; caller should recompute first
  end if;

  foreach v_slug in array builtins loop
    v_match := case v_slug
      when 'new_customer'  then a.recency_days is not null and a.recency_days <= 30 and coalesce(a.total_plays,0) < 2
      when 'inactive'      then a.recency_days is not null and a.recency_days > 60
      when 'high_value'    then coalesce(a.total_redemptions,0) >= 3 or coalesce(a.health_score,0) >= 60
      when 'coupon_hunter' then coalesce(a.total_plays,0) >= 3 and coalesce(a.total_redemptions,0) = 0
      else false
    end;

    -- Ensure the built-in segment exists for this tenant.
    insert into customer_segments (business_id, name, slug, type, description)
    values (p_business_id, initcap(replace(v_slug, '_', ' ')), v_slug, 'dynamic',
            'Built-in dynamic segment')
    on conflict (business_id, slug) do nothing;

    select id into v_seg_id from customer_segments
     where business_id = p_business_id and slug = v_slug;

    if v_match then
      insert into customer_segment_members (business_id, segment_id, customer_id, source)
      values (p_business_id, v_seg_id, p_customer_id, 'rule')
      on conflict (segment_id, customer_id) do nothing;
    else
      delete from customer_segment_members
       where segment_id = v_seg_id and customer_id = p_customer_id and source = 'rule';
    end if;
  end loop;
end $$;

revoke execute on function assign_customer_to_segments(uuid, uuid)
  from public, anon, authenticated;

-- Tenant-scoped segment listing with live member counts.
create or replace function merchant_segments(p_business_id uuid)
returns table (
  id           uuid,
  name         text,
  slug         text,
  type         text,
  is_active    boolean,
  member_count bigint,
  created_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.slug, s.type, s.is_active,
         count(m.id) as member_count, s.created_at
  from customer_segments s
  left join customer_segment_members m on m.segment_id = s.id
  where s.business_id = p_business_id
  group by s.id
  order by s.created_at desc;
$$;

revoke execute on function merchant_segments(uuid)
  from public, anon, authenticated;
