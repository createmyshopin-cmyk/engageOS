-- Add today / yesterday winner counts to the summary RPC.

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
      from customer_events e, day_bounds d
      where e.business_id = p_business_id
        and e.event_type = 'prize_won'
        and (e.created_at at time zone 'Asia/Kolkata')::date = d.today_ist
    ),
    (
      select count(*)::bigint
      from customer_events e, day_bounds d
      where e.business_id = p_business_id
        and e.event_type = 'prize_won'
        and (e.created_at at time zone 'Asia/Kolkata')::date = d.yesterday_ist
    );
$$;

revoke execute on function winners_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
