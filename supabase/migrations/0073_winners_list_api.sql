-- Winners dashboard: filtered list + KPI summary for /m/winners.

-- =============================================================
-- winners_summary — KPI cards for the Live Winners page.
-- =============================================================
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
  mom_growth_pct      numeric
)
language sql stable security definer set search_path = public as $$
  with wins as (
    select pz.prize_type
    from customer_events e
    left join prizes pz on pz.id = e.prize_id
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
      and (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at <= p_to)
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
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
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
    );
$$;

revoke execute on function winners_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- =============================================================
-- merchant_list_winners — paginated, filterable prize_won feed.
-- =============================================================
create or replace function merchant_list_winners(
  p_business_id    uuid,
  p_limit          int default 12,
  p_offset         int default 0,
  p_search         text default null,
  p_prize_category text default 'all',
  p_campaign_id    uuid default null,
  p_from           timestamptz default null,
  p_to             timestamptz default null
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
    left join customers cu on cu.id = e.customer_id
    left join campaigns ca on ca.id = e.campaign_id
    left join prizes pz on pz.id = e.prize_id
    left join coupons cp on cp.id = e.coupon_id
    where e.business_id = p_business_id
      and e.event_type = 'prize_won'
      and (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at <= p_to)
      and (p_campaign_id is null or e.campaign_id = p_campaign_id)
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

revoke execute on function merchant_list_winners(uuid, int, int, text, text, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
