-- =============================================================
-- EngageOS — Migration 0007: Campaign Details & SQL Play Engine Upgrades
-- Adds metadata columns to campaigns, custom coupon prefix,
-- and upgrades SQL functions to support custom prefixes.
-- =============================================================

-- 1. Add new columns to campaigns table
alter table campaigns
  add column if not exists description text,
  add column if not exists banner_url text,
  add column if not exists logo_url text,
  add column if not exists terms text,
  add column if not exists coupon_prefix text default 'ONAM';

-- 2. Drop existing constraint on status and apply the expanded one
alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','active','paused','completed','archived'));

-- 3. Upgrade generate_coupon_code to support custom prefixes
drop function if exists generate_coupon_code();

create or replace function generate_coupon_code(p_prefix text)
returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  v_code text;
  i int;
  v_prefix text;
begin
  v_prefix := upper(trim(coalesce(p_prefix, 'ONAM')));
  if v_prefix <> '' then
    v_prefix := v_prefix || '-';
  end if;

  loop
    v_code := v_prefix;
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * 31)::int, 1);
    end loop;
    exit when not exists (select 1 from coupons where code = v_code);
  end loop;
  return v_code;
end $$;

-- Keep fallback signature for compatibility
create or replace function generate_coupon_code()
returns text
language sql as $$
  select generate_coupon_code('ONAM');
$$;

-- 4. Upgrade play_campaign to dynamically use campaign's coupon_prefix
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
  v_prize prizes%rowtype;
  v_total_weight bigint;
  v_lose_weight bigint;
  v_roll bigint;
  v_cursor bigint := 0;
  v_won boolean := false;
  v_play_id uuid;
  v_code text;
  v_expires timestamptz;
  v_claimed boolean;
begin
  -- 1. Rate limits: per IP and per phone
  if not check_rate_limit('ip:' || p_ip, 30) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_rate_limit('ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- 2. Campaign must be live
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

  -- 3. Upsert customer
  insert into customers (business_id, phone, name)
  values (v_campaign.business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id into v_customer_id;

  -- 4. One play per campaign (unique index is the backstop)
  if exists (select 1 from plays
              where campaign_id = v_campaign.id and customer_id = v_customer_id) then
    return jsonb_build_object('status', 'already_played');
  end if;

  -- 5. Weighted draw. Losing weight = max(sum(prize weights), 1) so that
  --    overall win rate ≈ 50% when inventory is available; merchants control
  --    relative odds between prizes via weights.
  select coalesce(sum(weight), 0) into v_total_weight
    from prizes
   where campaign_id = v_campaign.id and weight > 0 and won_count < total_quantity;

  if v_total_weight > 0 then
    v_lose_weight := v_total_weight;  -- 50/50 win vs lose
    v_roll := floor(random() * (v_total_weight + v_lose_weight))::bigint;
    if v_roll < v_total_weight then
      -- Walk prize list to find the selected prize, then claim atomically.
      for v_prize in
        select * from prizes
         where campaign_id = v_campaign.id and weight > 0 and won_count < total_quantity
         order by id
      loop
        v_cursor := v_cursor + v_prize.weight;
        if v_roll < v_cursor then
          update prizes set won_count = won_count + 1
           where id = v_prize.id and won_count < total_quantity;
          v_claimed := found;
          if v_claimed then v_won := true; end if;
          exit;
        end if;
      end loop;
    end if;
  end if;

  -- 6. Record play
  insert into plays (campaign_id, business_id, customer_id, won, prize_id)
  values (v_campaign.id, v_campaign.business_id, v_customer_id, v_won,
          case when v_won then v_prize.id end)
  returning id into v_play_id;

  -- 7. Issue coupon in the same transaction
  if v_won then
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                       v_campaign.ends_at + interval '15 days');
    insert into coupons (business_id, campaign_id, prize_id, customer_id,
                         play_id, code, prize_name, expires_at)
    values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
            v_play_id, v_code, v_prize.name, v_expires);
    return jsonb_build_object(
      'status', 'ok', 'won', true,
      'prize_name', v_prize.name, 'coupon_code', v_code,
      'expires_at', v_expires);
  end if;

  return jsonb_build_object('status', 'ok', 'won', false);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;
