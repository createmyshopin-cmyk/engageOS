-- =============================================================
-- 0024_reward_lifecycle.sql — Release V1.1 Rewards Manager
--
-- Additive, non-destructive. Extends the FROZEN prize engine only by
-- adding columns and new SECURITY DEFINER mutators — play_campaign and
-- the existing merchant_update_prize/merchant_delete_prize are untouched.
--
--   * New reward properties: badge, sort_order, priority, is_active,
--     and active_weight (weight parked while a reward is disabled).
--   * Enable/Disable: the draw in play_campaign filters `weight > 0`, so a
--     disabled reward parks its weight in active_weight and sets weight = 0,
--     which removes it from the draw without any engine change. Enabling
--     restores the parked weight. is_active is the display-facing status.
--   * Duplicate/Enable/Disable mutators, ownership-guarded by the same
--     campaign->business join used elsewhere.
--   * Two new campaign_events types: reward.enabled / reward.disabled,
--     plus qr.printed for the QR print action.
-- =============================================================

-- 1. New reward property columns. All defaulted so existing rows are valid
--    and the frozen engine keeps drawing every currently-live reward.
alter table prizes
  add column if not exists badge         text,
  add column if not exists sort_order    int  not null default 0,
  add column if not exists priority      int  not null default 0,
  add column if not exists is_active     boolean not null default true,
  add column if not exists active_weight int;

-- 2. Extend the campaign_events CHECK with the two reward lifecycle events
--    and qr.printed. Drop + re-add with the FULL superset of all event types
--    (existing rows from 0016/0020 stay valid; new types are appended).
alter table campaign_events
  drop constraint if exists campaign_events_event_type_check;
alter table campaign_events
  add constraint campaign_events_event_type_check check (event_type in (
    -- Campaign lifecycle (0016 originals)
    'campaign.created', 'campaign.updated', 'campaign.published',
    'campaign.activated', 'campaign.paused', 'campaign.resumed',
    'campaign.ended', 'campaign.deleted', 'campaign.duplicated',
    'campaign.viewed', 'campaign.shared', 'campaign.archived',
    -- Aliases used by older callers
    'campaign.launched', 'campaign.retry_whatsapp',
    -- Distribution / print (0016 + 0024 new)
    'qr.generated', 'qr.downloaded', 'poster.printed', 'qr.printed',
    -- Customer funnel (0016)
    'customer.scan', 'customer.registered',
    'scratch.started', 'scratch.completed',
    'prize.allocated', 'prize.exhausted',
    'coupon.generated', 'coupon.redeemed', 'gift.claimed',
    -- WhatsApp lifecycle (0016)
    'whatsapp.queue', 'whatsapp.sent', 'whatsapp.delivered',
    'whatsapp.read', 'whatsapp.failed',
    -- Exports (0016)
    'csv.export', 'customer.export',
    -- Account / settings (0016)
    'merchant.login', 'settings.updated', 'analytics.viewed',
    -- Rewards manager (0022 / 0024)
    'reward.created', 'reward.updated', 'reward.deleted',
    'reward.duplicated', 'reward.enabled', 'reward.disabled',
    'reward.viewed', 'reward.claimed',
    -- Traffic sources (0023)
    'source.created', 'source.updated', 'source.deleted',
    -- Redirect engine (0023)
    'redirect.enabled', 'redirect.disabled', 'redirect.updated',
    'redirect.started', 'redirect.opened',
    'redirect.completed', 'redirect.cancelled'
  ));

-- 3. merchant_set_prize_active — enable/disable one reward. Parks/restores
--    the draw weight so the frozen play_campaign draw excludes disabled rewards.
create or replace function merchant_set_prize_active(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid,
  p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update prizes p
     set is_active = p_active,
         -- Disable: park current weight, then zero it (out of the draw).
         -- Enable: restore the parked weight (fallback to current if none).
         active_weight = case when p_active then active_weight
                              else coalesce(nullif(p.weight, 0), p.active_weight) end,
         weight = case when p_active then coalesce(p.active_weight, p.weight)
                       else 0 end
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and exists (
       select 1 from campaigns c
        where c.id = p.campaign_id
          and c.business_id = p_business_id
     );
  if not found then
    raise exception 'Reward not found or access denied';
  end if;
end $$;

revoke execute on function merchant_set_prize_active(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;

-- 4. merchant_duplicate_prize — clone one reward into the same campaign.
--    The copy starts disabled (weight 0, is_active false) so it can't win
--    until the merchant reviews it, and its name is suffixed "(Copy)".
create or replace function merchant_duplicate_prize(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new_id uuid;
begin
  insert into prizes (
    campaign_id, name, weight, total_quantity, expiry_days,
    prize_type, prize_value, is_fallback, image_url, background_color,
    description, badge, sort_order, priority, is_active, active_weight
  )
  select p.campaign_id,
         left(p.name || ' (Copy)', 60),
         0,                       -- starts out of the draw
         p.total_quantity, p.expiry_days,
         p.prize_type, p.prize_value,
         false,                   -- never clone a fallback flag
         p.image_url, p.background_color, p.description,
         p.badge, p.sort_order, p.priority,
         false,                   -- starts disabled
         coalesce(nullif(p.weight, 0), p.active_weight, p.weight)
    from prizes p
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and exists (
       select 1 from campaigns c
        where c.id = p.campaign_id
          and c.business_id = p_business_id
     )
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Reward not found or access denied';
  end if;
  return v_new_id;
end $$;

revoke execute on function merchant_duplicate_prize(uuid, uuid, uuid)
  from public, anon, authenticated;

-- 5. Extend merchant_update_prize to accept the new editable properties.
--    Same ownership join guard; signature is a superset (new trailing params).
create or replace function merchant_update_prize(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid,
  p_name text,
  p_weight int,
  p_total_quantity int,
  p_expiry_days int,
  p_prize_type text,
  p_prize_value numeric,
  p_is_fallback boolean,
  p_image_url text,
  p_background_color text,
  p_description text,
  p_badge text,
  p_sort_order int,
  p_priority int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update prizes p
     set name = p_name,
         -- Only touch the live weight when the reward is active; a disabled
         -- reward keeps weight 0 and stores the new weight in active_weight.
         weight = case when p.is_active then p_weight else 0 end,
         active_weight = case when p.is_active then active_weight else p_weight end,
         total_quantity = p_total_quantity,
         expiry_days = p_expiry_days,
         prize_type = p_prize_type,
         prize_value = p_prize_value,
         is_fallback = p_is_fallback,
         image_url = p_image_url,
         background_color = p_background_color,
         description = p_description,
         badge = p_badge,
         sort_order = coalesce(p_sort_order, 0),
         priority = coalesce(p_priority, 0)
   where p.id = p_prize_id
     and p.campaign_id = p_campaign_id
     and exists (
       select 1 from campaigns c
        where c.id = p.campaign_id
          and c.business_id = p_business_id
     );
  if not found then
    raise exception 'Reward not found or access denied';
  end if;
end $$;

revoke execute on function merchant_update_prize(
  uuid, uuid, uuid, text, int, int, int, text, numeric, boolean, text, text, text,
  text, int, int
) from public, anon, authenticated;
