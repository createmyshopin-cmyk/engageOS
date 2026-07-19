-- Surface coupon codes and prize gifts on customer profiles and list.

drop function if exists merchant_list_campaign_customers(uuid, int, timestamptz, uuid, text, text);

create function merchant_list_campaign_customers(
  p_business_id uuid,
  p_limit       int,
  p_cursor_ts   timestamptz default null,
  p_cursor_id   uuid default null,
  p_search      text default null,
  p_direction   text default 'desc'
) returns table (
  id                uuid,
  phone             text,
  name              text,
  email             text,
  created_at        timestamptz,
  latest_prize_name text,
  latest_code       text,
  reward_count      int
)
language sql stable security definer set search_path = public as $$
  with term as (
    select case
      when p_search is null or trim(p_search) = '' then null
      else '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    end as q
  )
  select
    c.id,
    c.phone,
    c.name,
    c.email,
    c.created_at,
    lat.prize_name as latest_prize_name,
    lat.code as latest_code,
    coalesce(rc.cnt, 0)::int as reward_count
  from customers c
  cross join term
  left join lateral (
    select co.prize_name, co.code
    from coupons co
    where co.business_id = p_business_id
      and co.customer_id = c.id
    order by co.created_at desc
    limit 1
  ) lat on true
  left join lateral (
    select count(*)::int as cnt
    from coupons co
    where co.business_id = p_business_id
      and co.customer_id = c.id
  ) rc on true
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

create or replace function merchant_customer_360(
  p_business_id uuid,
  p_customer_id uuid
) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (
      select to_jsonb(c) - 'business_id'
      from customers c
      where c.id = p_customer_id and c.business_id = p_business_id
    ),
    'consents', (
      select coalesce(jsonb_object_agg(channel, status), '{}'::jsonb)
      from (
        select distinct on (channel) channel, status
        from customer_consents
        where business_id = p_business_id and customer_id = p_customer_id
        order by channel, consented_at desc
      ) latest
    ),
    'tags', (
      select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
      from customer_tag_map m
      join customer_tags t on t.id = m.tag_id
      where m.business_id = p_business_id and m.customer_id = p_customer_id
    ),
    'analytics', (
      select to_jsonb(a) - 'business_id'
      from customer_analytics a
      where a.customer_id = p_customer_id and a.business_id = p_business_id
    ),
    'rewards', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select
          co.id,
          co.code,
          co.prize_name,
          coalesce(p.prize_type, 'coupon') as prize_type,
          co.status,
          coalesce(nullif(trim(camp.headline), ''), camp.name) as campaign_name,
          co.expires_at,
          co.redeemed_at,
          co.created_at,
          (co.shopify_discount_code_id is not null) as shopify_linked
        from coupons co
        join campaigns camp
          on camp.id = co.campaign_id
         and camp.business_id = p_business_id
        left join prizes p on p.id = co.prize_id
        where co.business_id = p_business_id
          and co.customer_id = p_customer_id
        order by co.created_at desc
        limit 25
      ) r
    ),
    'recent_activity', (
      select coalesce(jsonb_agg(row_to_json(tl)), '[]'::jsonb)
      from customer_timeline_unified(p_business_id, p_customer_id, 25, null) tl
    )
  );
$$;

revoke execute on function merchant_customer_360(uuid, uuid)
  from public, anon, authenticated;
