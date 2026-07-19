-- =============================================================
-- EngageOS — Migration 0066: Tenant guard on record_campaign_event.
--
-- When a campaign_id is supplied, verify it belongs to p_business_id
-- before inserting. Prevents cross-tenant analytics pollution when
-- server code passes a mismatched pair (e.g. public experience events).
-- =============================================================

create or replace function record_campaign_event(
  p_business_id uuid,
  p_campaign_id uuid,
  p_actor_type  text,
  p_actor_id    uuid,
  p_event_type  text,
  p_metadata    jsonb default '{}'::jsonb,
  p_ip_address  text default null,
  p_user_agent  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_campaign_id is not null then
    if not exists (
      select 1
      from campaigns c
      where c.id = p_campaign_id
        and c.business_id = p_business_id
    ) then
      raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
    end if;
  end if;

  insert into campaign_events (
    business_id, campaign_id, actor_type, actor_id,
    event_type, metadata, ip_address, user_agent
  ) values (
    p_business_id, p_campaign_id, p_actor_type, p_actor_id,
    p_event_type, coalesce(p_metadata, '{}'::jsonb), p_ip_address, p_user_agent
  ) returning id into v_id;
  return v_id;
end $$;

revoke execute on function record_campaign_event(uuid, uuid, text, uuid, text, jsonb, text, text)
  from public, anon, authenticated;
