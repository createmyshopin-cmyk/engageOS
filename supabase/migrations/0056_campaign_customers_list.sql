-- List only customers who participated in EngageOS campaigns (plays or
-- campaign-scoped funnel events). Excludes Shopify-synced store customers.

create or replace function merchant_list_campaign_customers(
  p_business_id uuid,
  p_limit       int,
  p_cursor_ts   timestamptz default null,
  p_cursor_id   uuid default null,
  p_search      text default null,
  p_direction   text default 'desc'
) returns table (
  id         uuid,
  phone      text,
  name       text,
  email      text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with term as (
    select case
      when p_search is null or trim(p_search) = '' then null
      else '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    end as q
  )
  select c.id, c.phone, c.name, c.email, c.created_at
  from customers c
  cross join term
  where c.business_id = p_business_id
    and c.deleted_at is null
    and (
      exists (
        select 1 from plays p
        where p.customer_id = c.id
          and p.business_id = p_business_id
      )
      or exists (
        select 1 from customer_events e
        where e.customer_id = c.id
          and e.business_id = p_business_id
          and e.campaign_id is not null
      )
    )
    and (
      term.q is null
      or c.name ilike term.q escape '\'
      or c.phone ilike term.q escape '\'
      or c.email ilike term.q escape '\'
    )
    and (
      p_cursor_ts is null
      or p_cursor_id is null
      or (
        coalesce(p_direction, 'desc') = 'desc'
        and (c.created_at < p_cursor_ts or (c.created_at = p_cursor_ts and c.id < p_cursor_id))
      )
      or (
        coalesce(p_direction, 'desc') = 'asc'
        and (c.created_at > p_cursor_ts or (c.created_at = p_cursor_ts and c.id > p_cursor_id))
      )
    )
  order by
    case when coalesce(p_direction, 'desc') = 'asc' then c.created_at end asc nulls last,
    case when coalesce(p_direction, 'desc') = 'desc' then c.created_at end desc nulls last,
    case when coalesce(p_direction, 'desc') = 'asc' then c.id end asc nulls last,
    case when coalesce(p_direction, 'desc') = 'desc' then c.id end desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function merchant_list_campaign_customers(uuid, int, timestamptz, uuid, text, text)
  from public, anon, authenticated;
