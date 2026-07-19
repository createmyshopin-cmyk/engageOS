-- Add per-campaign customer counts to the list-page stats rollup.
-- Uses the same registration-event source as campaign_event_totals so list
-- cards and detail KPIs stay aligned.

drop function if exists campaign_stats_for_business(uuid);

create function campaign_stats_for_business(p_business_id uuid)
returns table (
  campaign_id       uuid,
  plays             bigint,
  wins              bigint,
  redeemed          bigint,
  wa_sent           bigint,
  wa_failed         bigint,
  remaining_coupons bigint,
  customers         bigint
)
language sql stable security definer set search_path = public as $$
  select
    c.id as campaign_id,
    coalesce(pl.plays, 0)        as plays,
    coalesce(pl.wins, 0)         as wins,
    coalesce(co.redeemed, 0)     as redeemed,
    coalesce(co.wa_sent, 0)      as wa_sent,
    coalesce(co.wa_failed, 0)    as wa_failed,
    coalesce(pz.remaining, 0)    as remaining_coupons,
    coalesce(cu.customers, 0)    as customers
  from campaigns c
  left join lateral (
    select
      count(*)                              as plays,
      count(*) filter (where p.won)         as wins
    from plays p
    where p.campaign_id = c.id
  ) pl on true
  left join lateral (
    select
      count(*) filter (where cp.status = 'redeemed')  as redeemed,
      count(*) filter (where cp.wa_status = 'sent')   as wa_sent,
      count(*) filter (where cp.wa_status = 'failed') as wa_failed
    from coupons cp
    where cp.campaign_id = c.id
  ) co on true
  left join lateral (
    select count(*) as remaining
    from prizes pr
    where pr.campaign_id = c.id
  ) pz on true
  left join lateral (
    select count(distinct e.customer_id) as customers
    from customer_events e
    where e.campaign_id = c.id
      and e.business_id = p_business_id
      and e.event_type = 'registration'
  ) cu on true
  where c.business_id = p_business_id;
$$;

revoke execute on function campaign_stats_for_business(uuid)
  from public, anon, authenticated;
