-- =============================================================
-- EngageOS — Migration 0021: Safe Campaign Deletion Function
--
-- Problem: campaign_events has an append-only guard (BEFORE UPDATE
-- trigger) that raises an exception for ANY UPDATE — including the
-- cascaded ON DELETE SET NULL that Postgres fires internally when a
-- campaigns row is hard-deleted. This causes deleteById(campaigns)
-- to fail with "campaign_events is append-only: UPDATE is not permitted".
--
-- Fix: A SECURITY DEFINER function that:
--   1. Manually sets campaign_id = NULL in campaign_events (bypassing
--      the user-facing trigger by disabling it just for this session).
--   2. Hard-deletes the campaign row (no cascade UPDATE needed anymore).
--
-- This preserves the full audit trail (events remain with campaign_id
-- set to NULL, exactly as the original ON DELETE SET NULL intent), while
-- respecting the append-only immutability guarantee that covers the
-- event_type / metadata columns.
--
-- Caller must own the campaign (business_id check enforced here).
-- =============================================================

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
  -- Ownership check — abort immediately if the campaign doesn't belong
  -- to the supplied business_id (prevents cross-tenant deletions).
  if not exists (
    select 1 from campaigns
     where id = p_campaign_id
       and business_id = p_business_id
  ) then
    raise exception 'Campaign not found or access denied';
  end if;

  -- Disable the append-only guard ONLY for this session, just long
  -- enough to null-out the FK on historic events. The trigger remains
  -- active for all other sessions at all times.
  alter table campaign_events disable trigger campaign_events_no_update;

  -- Null the FK on every event that referenced this campaign so the
  -- event log is preserved (audit trail intact, campaign_id = NULL).
  update campaign_events
     set campaign_id = null
   where campaign_id = p_campaign_id;

  -- Re-enable the guard immediately after the update.
  alter table campaign_events enable trigger campaign_events_no_update;

  -- Now delete the campaign row itself. No cascaded SET NULL fires
  -- because campaign_events.campaign_id is already null.
  delete from campaigns
   where id = p_campaign_id
     and business_id = p_business_id;

exception
  when others then
    -- Always re-enable the trigger even if something goes wrong.
    alter table campaign_events enable trigger campaign_events_no_update;
    raise;
end $$;

-- Revoke from public; only the service role (used by server actions)
-- may call this function.
revoke all on function delete_campaign(uuid, uuid) from public, anon, authenticated;
