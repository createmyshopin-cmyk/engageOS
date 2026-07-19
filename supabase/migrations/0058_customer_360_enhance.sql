-- Enrich customer 360 with live stats fallback, summary, and analytics backfill.

create or replace function merchant_customer_360(
  p_business_id uuid,
  p_customer_id uuid
) returns jsonb
language sql stable security definer set search_path = public as $$
  with live as (
    select
      coalesce((
        select count(*)::int from plays
         where business_id = p_business_id and customer_id = p_customer_id
      ), 0) as total_plays,
      coalesce((
        select count(*)::int from plays
         where business_id = p_business_id and customer_id = p_customer_id and won
      ), 0) as total_wins,
      coalesce((
        select count(*)::int from coupons
         where business_id = p_business_id and customer_id = p_customer_id
           and status = 'redeemed'
      ), 0) as total_redemptions,
      (
        select min(ts) from (
          select min(created_at) as ts from customer_events
           where business_id = p_business_id and customer_id = p_customer_id
          union all
          select min(occurred_at) from events
           where business_id = p_business_id and customer_id = p_customer_id
        ) t
      ) as first_seen_at,
      (
        select max(ts) from (
          select max(created_at) as ts from customer_events
           where business_id = p_business_id and customer_id = p_customer_id
          union all
          select max(occurred_at) from events
           where business_id = p_business_id and customer_id = p_customer_id
        ) t
      ) as last_seen_at,
      coalesce((
        select count(*)::int from coupons
         where business_id = p_business_id and customer_id = p_customer_id
      ), 0) as coupons_total,
      coalesce((
        select count(*)::int from coupons
         where business_id = p_business_id and customer_id = p_customer_id
           and status = 'issued'
      ), 0) as coupons_active,
      coalesce((
        select count(*)::int from coupons
         where business_id = p_business_id and customer_id = p_customer_id
           and status = 'redeemed'
      ), 0) as coupons_redeemed,
      coalesce((
        select count(distinct campaign_id)::int from plays
         where business_id = p_business_id and customer_id = p_customer_id
      ), 0) as campaigns_played
  )
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
    'summary', (
      select jsonb_build_object(
        'coupons_total', l.coupons_total,
        'coupons_active', l.coupons_active,
        'coupons_redeemed', l.coupons_redeemed,
        'campaigns_played', l.campaigns_played,
        'customer_since', (
          select c.created_at from customers c
           where c.id = p_customer_id and c.business_id = p_business_id
        ),
        'last_seen_at', l.last_seen_at
      )
      from live l
    ),
    'analytics', coalesce(
      (
        select to_jsonb(a) - 'business_id'
        from customer_analytics a
        where a.customer_id = p_customer_id and a.business_id = p_business_id
      ),
      (
        select jsonb_build_object(
          'total_orders', 0,
          'total_spend', 0,
          'total_plays', l.total_plays,
          'total_wins', l.total_wins,
          'total_redemptions', l.total_redemptions,
          'first_seen_at', l.first_seen_at,
          'last_seen_at', l.last_seen_at,
          'recency_days', case
            when l.last_seen_at is null then null
            else floor(extract(epoch from (now() - l.last_seen_at)) / 86400)::int
          end,
          'frequency', l.total_plays,
          'monetary', l.total_wins,
          'rfm_score', null,
          'health_score', least(100, greatest(0,
            l.total_redemptions * 20 +
            l.total_wins * 5 +
            case when l.last_seen_at is not null
                  and l.last_seen_at > now() - interval '30 days'
                 then 20 else 0 end
          )),
          'clv', null
        )
        from live l
      )
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
  )
  from live;
$$;

revoke execute on function merchant_customer_360(uuid, uuid)
  from public, anon, authenticated;

-- Backfill analytics for campaign customers missing a rollup row.
do $$
declare
  r record;
begin
  for r in
    select distinct c.business_id, c.id as customer_id
    from customers c
    where c.deleted_at is null
      and (
        exists (select 1 from plays p where p.customer_id = c.id)
        or exists (select 1 from coupons co where co.customer_id = c.id)
        or exists (
          select 1 from customer_events e
           where e.customer_id = c.id and e.campaign_id is not null
        )
      )
      and not exists (
        select 1 from customer_analytics a where a.customer_id = c.id
      )
  loop
    perform recompute_customer_analytics(r.business_id, r.customer_id);
  end loop;
end $$;
