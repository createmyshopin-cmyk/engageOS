-- Business-wide daily activity for merchant dashboard charts.

create or replace function business_daily_activity(
  p_business_id uuid,
  p_days        int default 7
) returns table (
  day           date,
  registrations bigint,
  scratches     bigint,
  coupons       bigint,
  redemptions   bigint
)
language sql stable security definer set search_path = public as $$
  select
    (e.created_at at time zone 'Asia/Kolkata')::date as day,
    count(*) filter (where e.event_type = 'registration')   as registrations,
    count(*) filter (where e.event_type = 'scratch')          as scratches,
    count(*) filter (where e.event_type = 'coupon_issued')    as coupons,
    count(*) filter (where e.event_type = 'coupon_redeemed')  as redemptions
  from customer_events e
  where e.business_id = p_business_id
    and e.created_at >= now() - (greatest(1, least(coalesce(p_days, 7), 90)) || ' days')::interval
  group by 1
  order by 1 asc;
$$;

revoke execute on function business_daily_activity(uuid, int)
  from public, anon, authenticated;
