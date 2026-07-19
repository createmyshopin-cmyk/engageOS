-- Fix: STABLE list RPCs cannot INSERT via ensure_default_* when called via PostgREST.

create or replace function merchant_list_points_rules(p_business_id uuid)
returns setof points_rules
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_default_points_rules(p_business_id);
  return query
    select * from points_rules
     where business_id = p_business_id
     order by rule_type;
end $$;

revoke execute on function merchant_list_points_rules(uuid)
  from public, anon, authenticated;

create or replace function merchant_list_membership_tiers(p_business_id uuid)
returns setof membership_tiers
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_default_membership_tiers(p_business_id);
  return query
    select * from membership_tiers
     where business_id = p_business_id
     order by sort_order;
end $$;

revoke execute on function merchant_list_membership_tiers(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
