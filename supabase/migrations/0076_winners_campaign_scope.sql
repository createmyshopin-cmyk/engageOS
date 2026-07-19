-- Winners list/summary: scope to active + ended (completed) campaigns by default.

drop function if exists merchant_list_winners(uuid, int, int, text, text, uuid, timestamptz, timestamptz);

create or replace function merchant_list_winners(
  p_business_id    uuid,
  p_limit          int default 12,
  p_offset         int default 0,
  p_search         text default null,
  p_prize_category text default 'all',
  p_campaign_id    uuid default null,
  p_from           timestamptz default null,
  p_to             timestamptz default null,
  p_campaign_scope text default 'eligible'
)
returns table (
  event_id        uuid,
  customer_id     uuid,
  customer_name   text,
  customer_phone  text,
  campaign_id     uuid,
  campaign_name   text,
  campaign_type   text,
  prize_name      text,
  prize_type      text,
  prize_value     numeric,
  coupon_code     text,
  won_at          timestamptz,
  wa_opt_out      boolean,
  total_count     bigint
)
language sql stable security definer set search_path = public as $$
  with term as (
    select case
      when p_search is null or trim(p_search) = '' then null
      else '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    end as q
  ),
  bounds as (
    select
      case when p_from is null then null else (p_from at time zone 'Asia/Kolkata')::date end as from_date,
      case when p_to is null then null else (p_to at time zone 'Asia/Kolkata')::date end as to_date
  ),
  base as (
    select
      e.id as event_id,
      e.customer_id,
      cu.name as customer_name,
      cu.phone as customer_phone,
      ca.id as campaign_id,
      ca.name as campaign_name,
      ca.campaign_type,
      coalesce(pz.name, e.metadata->>'prize_name') as prize_name,
      pz.prize_type,
      pz.prize_value,
      cp.code as coupon_code,
      e.created_at as won_at,
      coalesce(cu.wa_opt_out, false) as wa_opt_out
    from customer_events e
    cross join term
    cross join bounds b
    left join customers cu on cu.id = e.customer_id
    inner join campaigns ca on ca.id = e.campaign_id
    left join prizes pz on pz.id = e.prize_id
    left join coupons cp on cp.id = e.coupon_id
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
      and (
        b.from_date is null
        or (e.created_at at time zone 'Asia/Kolkata')::date >= b.from_date
      )
      and (
        b.to_date is null
        or (e.created_at at time zone 'Asia/Kolkata')::date <= b.to_date
      )
      and (p_campaign_id is null or e.campaign_id = p_campaign_id)
      and (
        p_campaign_id is not null
        or case coalesce(p_campaign_scope, 'eligible')
             when 'active' then ca.status = 'active'
             when 'ended' then ca.status = 'completed'
             else ca.status in ('active', 'completed')
           end
      )
      and (
        coalesce(p_prize_category, 'all') = 'all'
        or (p_prize_category = 'coupon' and pz.prize_type = 'coupon')
        or (
          p_prize_category = 'gift'
          and pz.prize_type in ('physical_gift', 'gift_voucher')
        )
        or (
          p_prize_category = 'scratch_win'
          and ca.campaign_type = 'scratch_win'
        )
      )
      and (
        term.q is null
        or cu.name ilike term.q escape '\'
        or cu.phone ilike term.q escape '\'
        or cp.code ilike term.q escape '\'
      )
  )
  select
    b.event_id,
    b.customer_id,
    b.customer_name,
    b.customer_phone,
    b.campaign_id,
    b.campaign_name,
    b.campaign_type,
    b.prize_name,
    b.prize_type,
    b.prize_value,
    b.coupon_code,
    b.won_at,
    b.wa_opt_out,
    count(*) over() as total_count
  from base b
  order by b.won_at desc, b.event_id desc
  limit greatest(1, least(coalesce(p_limit, 12), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke execute on function merchant_list_winners(uuid, int, int, text, text, uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;

drop function if exists winners_summary(uuid, timestamptz, timestamptz);

create or replace function winners_summary(
  p_business_id uuid,
  p_from        timestamptz default null,
  p_to          timestamptz default null
)
returns table (
  total_winners       bigint,
  coupons_won         bigint,
  gifts_won           bigint,
  ongoing_campaigns   bigint,
  prizes_in_period    bigint,
  mom_growth_pct      numeric,
  winners_today       bigint,
  winners_yesterday   bigint
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      case when p_from is null then null else (p_from at time zone 'Asia/Kolkata')::date end as from_date,
      case when p_to is null then null else (p_to at time zone 'Asia/Kolkata')::date end as to_date
  ),
  eligible_campaign as (
    select c.id
    from campaigns c
    where c.business_id = p_business_id
      and c.status in ('active', 'completed')
  ),
  wins as (
    select pz.prize_type
    from customer_events e
    cross join bounds b
    inner join eligible_campaign ec on ec.id = e.campaign_id
    left join prizes pz on pz.id = e.prize_id
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
      and (
        b.from_date is null
        or (e.created_at at time zone 'Asia/Kolkata')::date >= b.from_date
      )
      and (
        b.to_date is null
        or (e.created_at at time zone 'Asia/Kolkata')::date <= b.to_date
      )
  ),
  mom as (
    select
      count(*) filter (
        where e.created_at >= now() - interval '30 days'
      )::bigint as current_30d,
      count(*) filter (
        where e.created_at >= now() - interval '60 days'
          and e.created_at < now() - interval '30 days'
      )::bigint as prior_30d
    from customer_events e
    inner join eligible_campaign ec on ec.id = e.campaign_id
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
  ),
  day_bounds as (
    select
      (now() at time zone 'Asia/Kolkata')::date as today_ist,
      ((now() at time zone 'Asia/Kolkata')::date - interval '1 day')::date as yesterday_ist
  )
  select
    (select count(*)::bigint from wins),
    (select count(*)::bigint from wins where prize_type = 'coupon'),
    (select count(*)::bigint from wins where prize_type in ('physical_gift', 'gift_voucher')),
    (
      select count(*)::bigint
      from campaigns c
      where c.business_id = p_business_id
        and c.status = 'active'
    ),
    (select count(*)::bigint from wins),
    (
      select case
        when m.prior_30d = 0 then
          case when m.current_30d > 0 then 100::numeric else 0::numeric end
        else round((m.current_30d - m.prior_30d)::numeric / m.prior_30d::numeric * 100, 1)
      end
      from mom m
    ),
    (
      select count(*)::bigint
      from customer_events e
      inner join eligible_campaign ec on ec.id = e.campaign_id
      cross join day_bounds d
      where e.business_id = p_business_id
        and e.event_type = 'prize_won'
        and (e.created_at at time zone 'Asia/Kolkata')::date = d.today_ist
    ),
    (
      select count(*)::bigint
      from customer_events e
      inner join eligible_campaign ec on ec.id = e.campaign_id
      cross join day_bounds d
      where e.business_id = p_business_id
        and e.event_type = 'prize_won'
        and (e.created_at at time zone 'Asia/Kolkata')::date = d.yesterday_ist
    );
$$;

revoke execute on function winners_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
