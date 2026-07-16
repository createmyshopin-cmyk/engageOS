-- =============================================================
-- EngageOS — Migration 0022: Reward Images & Rewards Manager
--
-- Adds per-reward presentation + description fields and the tenant-
-- isolated Storage bucket that backs them, then extends the three
-- read/return RPCs that surface prizes so the new fields flow through to
-- both the merchant dashboard and the customer result page. Finally,
-- adds two SECURITY DEFINER mutation RPCs so a merchant can update/delete
-- a single reward without granting write access to the prizes table.
--
-- Fully additive & backward-compatible:
--   - New prize columns are nullable; existing prizes get null.
--   - gift_inventory / campaign_display / play_campaign are superseded via
--     CREATE OR REPLACE (applied migrations stay immutable); every prior
--     behavior — source tracking, event emissions, return shape — is
--     preserved verbatim, only the new image/background/description fields
--     are added.
--   - merchant_update_prize / merchant_delete_prize enforce the
--     campaign -> business ownership join in SQL, so tenant safety never
--     depends on the caller. Service-role only (revoked from public).
-- =============================================================

-- =============================================================
-- 1. New presentation + description columns on prizes.
-- =============================================================
alter table prizes
  add column if not exists image_url text,
  add column if not exists background_color text
    check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists description text
    check (description is null or char_length(description) <= 280);

-- =============================================================
-- 2. Public Storage bucket for reward images. Objects are keyed
--    {business_id}/{campaign_id}/{uuid.ext} by the upload route; public
--    read is fine (images are shown to anonymous customers), while writes
--    only ever happen through the service-role client server-side.
-- =============================================================
insert into storage.buckets (id, name, public)
values ('reward-images', 'reward-images', true)
on conflict (id) do nothing;

-- =============================================================
-- 3. gift_inventory — now also returns image_url + background_color so the
--    merchant Gift Inventory dashboard can show thumbnails. Every other
--    column and the tenant-scoping campaign join are unchanged from 0014.
-- =============================================================
-- Drop first: Postgres cannot change a function's return type via
-- CREATE OR REPLACE — the new RETURNS TABLE adds image_url + background_color.
drop function if exists gift_inventory(uuid);
create or replace function gift_inventory(p_business_id uuid)
returns table (
  prize_id       uuid,
  campaign_id    uuid,
  campaign_name  text,
  campaign_status text,
  prize_name     text,
  prize_type     text,
  prize_value    numeric,
  is_fallback    boolean,
  weight         int,
  total_quantity int,
  won_count      int,
  remaining      int,
  image_url      text,
  background_color text
)
language sql stable security definer set search_path = public as $$
  select
    pz.id as prize_id,
    ca.id as campaign_id,
    ca.name as campaign_name,
    ca.status as campaign_status,
    pz.name as prize_name,
    pz.prize_type,
    pz.prize_value,
    pz.is_fallback,
    pz.weight,
    pz.total_quantity,
    pz.won_count,
    greatest(pz.total_quantity - pz.won_count, 0) as remaining,
    pz.image_url,
    pz.background_color
  from prizes pz
  join campaigns ca on ca.id = pz.campaign_id
  where ca.business_id = p_business_id
  order by ca.created_at desc, pz.is_fallback, pz.weight desc, pz.created_at;
$$;

revoke execute on function gift_inventory(uuid) from public, anon, authenticated;

-- =============================================================
-- 4. campaign_display — the prizes aggregate now carries per-prize display
--    detail (name/image/background) instead of a bare name array, so the
--    customer play page can render each reward. Resolution by
--    (merchant_slug, campaign_slug) and all other fields are unchanged
--    from 0019. Ordering by weight desc is preserved.
-- =============================================================
create or replace function campaign_display(p_merchant_slug text, p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'campaign_id', c.id,
    'name', c.name,
    'headline', c.headline,
    'business_name', b.name,
    'logo_url', b.logo_url,
    'ends_at', c.ends_at,
    'prizes', (select coalesce(
                 jsonb_agg(
                   jsonb_build_object(
                     'name', p.name,
                     'prize_type', p.prize_type,
                     'image_url', p.image_url,
                     'background_color', p.background_color
                   ) order by p.weight desc
                 ), '[]'::jsonb)
               from prizes p where p.campaign_id = c.id and p.weight > 0)
  )
  from campaigns c
  join businesses b on b.id = c.business_id
  where c.slug = p_slug
    and b.slug = p_merchant_slug
    and c.status = 'active'
    and now() between c.starts_at and c.ends_at
    and b.active = true
$$;

grant execute on function campaign_display(text, text) to anon, authenticated;

-- =============================================================
-- 5. play_campaign — the winning JSON result now also carries the won
--    reward's image + background so the result screen can render the exact
--    prize. Superseding the 6-arg (source-tracked) signature from 0020;
--    EVERY prior behavior — rate limits, play cap, one-play invariant,
--    prize allocation, coupon issuance, source stamping, and all
--    customer_events + campaign_events emissions — is preserved verbatim.
--    The only change is two extra keys in the final won return.
-- =============================================================
create or replace function play_campaign(
  p_merchant_slug text,
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text,
  p_source text default 'direct'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_business businesses%rowtype;
  v_customer_id uuid;
  v_prior_plays int;
  v_play_count int;
  v_prize prizes%rowtype;
  v_prize_id uuid;
  v_won boolean := false;
  v_play_id uuid;
  v_coupon_id uuid;
  v_code text;
  v_expires timestamptz;
  v_real_remaining int;
  v_source text := coalesce(nullif(trim(p_source), ''), 'direct');
begin
  -- 1. Rate limits: per IP and per phone.
  if not check_rate_limit('ip:' || p_ip, 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 2. Campaign must be live AND belong to the named merchant.
  select c.* into v_campaign from campaigns c
    join businesses b on b.id = c.business_id
   where c.slug = p_campaign_slug
     and b.slug = p_merchant_slug
     and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  select b.* into v_business from businesses b
   where b.id = v_campaign.business_id and b.active = true;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  -- 3. Campaign-wide play cap (fraud control). Null = unlimited.
  if v_campaign.play_limit is not null then
    select count(*) into v_play_count from plays where campaign_id = v_campaign.id;
    if v_play_count >= v_campaign.play_limit then
      return jsonb_build_object('status', 'campaign_full');
    end if;
  end if;

  -- 4. Upsert customer (race-safe via ON CONFLICT, as in 0001).
  insert into customers (business_id, phone, name)
  values (v_campaign.business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id into v_customer_id;

  select count(*) into v_prior_plays from plays
   where business_id = v_campaign.business_id and customer_id = v_customer_id;

  -- 5. One play per campaign (unique index is the backstop).
  if exists (select 1 from plays
              where campaign_id = v_campaign.id and customer_id = v_customer_id) then
    return jsonb_build_object('status', 'already_played');
  end if;

  -- 6. Funnel: registration (+ return_visit for existing customers).
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'registration', null, null,
                                jsonb_build_object('name', p_name, 'source', v_source));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'customer.registered',
                                jsonb_build_object('customerName', p_name,
                                                   'returning', v_prior_plays > 0,
                                                   'source', v_source),
                                p_ip, null);
  if v_prior_plays > 0 then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'return_visit', null, null,
                                  jsonb_build_object('prior_plays', v_prior_plays, 'source', v_source));
  end if;

  -- 7. Allocate a prize via the reusable engine.
  v_prize_id := allocate_prize(v_campaign.id);
  if v_prize_id is not null then
    select * into v_prize from prizes where id = v_prize_id;
    v_won := true;
  end if;

  -- 8. Record the play.
  insert into plays (campaign_id, business_id, customer_id, won, prize_id)
  values (v_campaign.id, v_campaign.business_id, v_customer_id, v_won, v_prize_id)
  returning id into v_play_id;

  -- 9. Funnel: scratch + prize outcome.
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'scratch', null, null,
                                jsonb_build_object('source', v_source));
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'scratch.completed',
                                jsonb_build_object('won', v_won, 'source', v_source),
                                p_ip, null);

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null,
                                  jsonb_build_object('source', v_source));
    return jsonb_build_object('status', 'ok', 'won', false);
  end if;

  -- 10. Issue the coupon in the same transaction.
  v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
  v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                     v_campaign.ends_at + interval '15 days');
  insert into coupons (business_id, campaign_id, prize_id, customer_id,
                       play_id, code, prize_name, expires_at)
  values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
          v_play_id, v_code, v_prize.name, v_expires)
  returning id into v_coupon_id;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'prize_won', v_prize.id, v_coupon_id,
                                jsonb_build_object('prize_name', v_prize.name,
                                                   'prize_type', v_prize.prize_type,
                                                   'source', v_source));
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code, 'source', v_source));

  -- Unified campaign_events log (0016): prize allocation + coupon generation.
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'prize.allocated',
                                jsonb_build_object(
                                  'customerId', v_customer_id,
                                  'customerName', p_name,
                                  'prizeId', v_prize.id,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'couponId', v_coupon_id,
                                  'source', v_source),
                                p_ip, null);
  perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                'customer', v_customer_id,
                                'coupon.generated',
                                jsonb_build_object(
                                  'couponCode', v_code,
                                  'couponId', v_coupon_id,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'source', v_source),
                                p_ip, null);

  -- If that claim exhausted the real (non-fallback) prize pool, mark it.
  select coalesce(sum(greatest(total_quantity - won_count, 0)), 0)
    into v_real_remaining
    from prizes
   where campaign_id = v_campaign.id and not is_fallback;
  if v_real_remaining = 0 and not v_prize.is_fallback then
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'system', null,
                                  'prize.exhausted',
                                  jsonb_build_object('lastPrizeId', v_prize.id,
                                                     'lastPrizeName', v_prize.name),
                                  null, null);
  end if;

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'prize_image_url', v_prize.image_url,
    'prize_background_color', v_prize.background_color,
    'coupon_code', v_code,
    'expires_at', v_expires);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text, text, text) from public, anon, authenticated;

-- =============================================================
-- 6. merchant_update_prize — update one reward, but only if it belongs to
--    a campaign owned by p_business_id. The ownership join lives here in
--    SQL so tenant safety never depends on the calling code. Nullable
--    params overwrite the corresponding column (a reward edit always sends
--    the full row from the manager form).
-- =============================================================
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
  p_description text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update prizes p
     set name = p_name,
         weight = p_weight,
         total_quantity = p_total_quantity,
         expiry_days = p_expiry_days,
         prize_type = p_prize_type,
         prize_value = p_prize_value,
         is_fallback = p_is_fallback,
         image_url = p_image_url,
         background_color = p_background_color,
         description = p_description
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
  uuid, uuid, uuid, text, int, int, int, text, numeric, boolean, text, text, text
) from public, anon, authenticated;

-- =============================================================
-- 7. merchant_delete_prize — delete one reward, same ownership join guard.
-- =============================================================
create or replace function merchant_delete_prize(
  p_business_id uuid,
  p_campaign_id uuid,
  p_prize_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from prizes p
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

revoke execute on function merchant_delete_prize(uuid, uuid, uuid)
  from public, anon, authenticated;
