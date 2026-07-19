-- Fix delete_campaign: customer_events (and events) also have append-only
-- UPDATE guards and campaign_id ON DELETE SET NULL. Postgres implements SET
-- NULL as an UPDATE, which the immutability triggers block — same root cause
-- as migration 0021 fixed for campaign_events.
--
-- Cascaded deletes of prizes/coupons (ON DELETE CASCADE from campaigns) also
-- fire SET NULL on customer_events.prize_id / coupon_id — those UPDATEs must
-- be pre-empted the same way.

create or replace function delete_campaign(
  p_campaign_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from campaigns
     where id = p_campaign_id
       and business_id = p_business_id
  ) then
    raise exception 'Campaign not found or access denied';
  end if;

  -- Null FKs on append-only event logs before hard-delete. Each table's
  -- ON DELETE SET NULL (direct or via cascaded prize/coupon deletes) would
  -- otherwise fire an UPDATE blocked by immutability triggers.
  alter table campaign_events disable trigger campaign_events_no_update;
  alter table customer_events disable trigger customer_events_no_update;
  alter table events disable trigger events_no_update;

  update campaign_events
     set campaign_id = null
   where campaign_id = p_campaign_id;

  update customer_events
     set campaign_id = null,
         prize_id = null,
         coupon_id = null
   where campaign_id = p_campaign_id
      or prize_id in (select id from prizes where campaign_id = p_campaign_id)
      or coupon_id in (select id from coupons where campaign_id = p_campaign_id);

  update events
     set campaign_id = null
   where campaign_id = p_campaign_id;

  alter table campaign_events enable trigger campaign_events_no_update;
  alter table customer_events enable trigger customer_events_no_update;
  alter table events enable trigger events_no_update;

  delete from campaigns
   where id = p_campaign_id
     and business_id = p_business_id;

exception
  when others then
    alter table campaign_events enable trigger campaign_events_no_update;
    alter table customer_events enable trigger customer_events_no_update;
    alter table events enable trigger events_no_update;
    raise;
end $$;

revoke all on function delete_campaign(uuid, uuid) from public, anon, authenticated;
