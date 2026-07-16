-- =============================================================
-- EngageOS Release V1 — Migration 0012: Reusable Prize Engine
--
-- Extracts the weighted-allocation + atomic-decrement + fallback
-- logic into a single reusable primitive, allocate_prize(), that
-- EVERY future campaign type (Scratch, Spin, Lucky Draw, Quiz,
-- Coupon Drop) can call. play_campaign() is rewritten to use it
-- and to emit immutable customer_events inline, in the same
-- transaction as the play + coupon. All existing invariants and
-- the ~50% win model are preserved; PlayResult gains prize_type
-- and prize_value (additive, backward-compatible).
-- =============================================================

-- 0. Per-campaign play cap (fraud control #12). Null = unlimited.
alter table campaigns
  add column if not exists play_limit int check (play_limit is null or play_limit >= 0);

-- =============================================================
-- allocate_prize — THE reusable engine primitive.
--
-- Given a campaign, performs a weighted draw against in-stock,
-- non-fallback prizes with a losing weight equal to the total
-- in-stock weight (~50% win rate when inventory is available),
-- then atomically claims the selected prize. Automatic fallback:
--   * if the drawn prize is exhausted at claim time (race), OR
--   * if the entire real prize pool is already exhausted,
-- the designated fallback prize (prizes.is_fallback) is claimed
-- instead, so a player never hits a dead end once stock runs low.
-- Returns the claimed prize id, or null for a genuine loss.
--
-- Pure allocation only: it does NOT record plays, coupons, or
-- events — callers compose those around it. This is what makes it
-- reusable across game types.
-- =============================================================
create or replace function allocate_prize(p_campaign_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prize prizes%rowtype;
  v_total_weight bigint;
  v_roll bigint;
  v_cursor bigint := 0;
  v_claimed_id uuid;
  v_fallback_id uuid;
begin
  -- In-stock, weighted, non-fallback pool.
  select coalesce(sum(weight), 0) into v_total_weight
    from prizes
   where campaign_id = p_campaign_id
     and weight > 0
     and not is_fallback
     and won_count < total_quantity;

  if v_total_weight > 0 then
    -- 50/50 win vs lose; merchants control relative odds via weights.
    v_roll := floor(random() * (v_total_weight * 2))::bigint;
    if v_roll < v_total_weight then
      -- Win roll: walk the pool to find the selected prize, claim atomically.
      for v_prize in
        select * from prizes
         where campaign_id = p_campaign_id
           and weight > 0
           and not is_fallback
           and won_count < total_quantity
         order by id
      loop
        v_cursor := v_cursor + v_prize.weight;
        if v_roll < v_cursor then
          update prizes set won_count = won_count + 1
           where id = v_prize.id and won_count < total_quantity;
          if found then
            return v_prize.id;         -- claimed the intended prize
          end if;
          exit;                        -- lost the race → try fallback below
        end if;
      end loop;
      -- Reached only if the intended prize was exhausted at claim time.
      -- Automatic fallback so the winner still gets something.
      update prizes set won_count = won_count + 1
       where campaign_id = p_campaign_id and is_fallback and won_count < total_quantity
      returning id into v_fallback_id;
      return v_fallback_id;            -- null if no/exhausted fallback
    end if;
    -- Lose roll while real stock exists: a genuine loss.
    return null;
  end if;

  -- Real pool fully exhausted: award the fallback if configured & in stock.
  update prizes set won_count = won_count + 1
   where campaign_id = p_campaign_id and is_fallback and won_count < total_quantity
  returning id into v_fallback_id;
  return v_fallback_id;                -- null when there is no fallback left
end $$;

revoke execute on function allocate_prize(uuid) from public, anon, authenticated;

-- =============================================================
-- play_campaign — Scratch & Win entry point, now event-sourced.
-- Composes allocate_prize with play/coupon writes and emits the
-- immutable funnel events (registration, scratch, prize_won/lost,
-- coupon_issued, return_visit) in one transaction.
-- =============================================================
create or replace function play_campaign(
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text
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
begin
  -- 1. Rate limits: per IP and per phone.
  if not check_rate_limit('ip:' || p_ip, 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 2. Campaign must be live.
  select c.* into v_campaign from campaigns c
   where c.slug = p_campaign_slug and c.status = 'active'
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

  -- Detect returning customers for the funnel: any prior play for this
  -- business means this is a return visit (counted before the new play).
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
                                jsonb_build_object('name', p_name));
  if v_prior_plays > 0 then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'return_visit', null, null,
                                  jsonb_build_object('prior_plays', v_prior_plays));
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
                                'scratch', null, null, '{}'::jsonb);

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null, '{}'::jsonb);
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
                                                   'prize_type', v_prize.prize_type));
  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code));

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'coupon_code', v_code,
    'expires_at', v_expires);
exception
  when unique_violation then
    -- Concurrent double-submit of the same phone: plays unique index fired.
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text) from public, anon, authenticated;
