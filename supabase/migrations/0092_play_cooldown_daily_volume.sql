-- Play limits: 5s cooldown between retries, up to 100000 attempts per 24h per campaign.
-- Replaces hourly counters that blocked legitimate event traffic.

create or replace function check_rate_limit_window(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
                  when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                  then 1 else rate_limits.count + 1
                end,
        window_start = case
                         when rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                         then now() else rate_limits.window_start
                       end
  returning count into v_count;
  return v_count <= p_max;
end $$;

-- Returns false when p_key was used within the cooldown window (does not advance on block).
create or replace function check_play_cooldown(p_key text, p_cooldown_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  select window_start into v_last from rate_limits where key = p_key;
  if found and v_last > now() - make_interval(secs => p_cooldown_seconds) then
    return false;
  end if;
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set window_start = now(), count = 1;
  return true;
end $$;

revoke execute on function check_rate_limit_window(text, int, int) from public, anon, authenticated;
revoke execute on function check_play_cooldown(text, int) from public, anon, authenticated;

create or replace function play_campaign(
  p_merchant_slug text,
  p_campaign_slug text,
  p_phone text,
  p_name text,
  p_ip text,
  p_source text default 'direct',
  p_device_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_campaign campaigns%rowtype;
  v_business businesses%rowtype;
  v_config campaign_coupon_configs%rowtype;
  v_has_config boolean := false;
  v_customer_id uuid;
  v_is_new_customer boolean := false;
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
  v_parent_gid text;
  v_coupon_source text := 'internal';
  v_needs_recon boolean := false;
  v_redeem_online boolean := false;
  v_discount_summary text;
  v_store_url text;
  v_disc_type text;
  v_disc_value numeric;
begin
  -- 5 second cooldown between attempts (no counter burn when blocked)
  if not check_play_cooldown('cd:ph:' || p_phone, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not check_play_cooldown('cd:ip:' || p_ip, 5) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select c.* into v_campaign from campaigns c
    join businesses b on b.id = c.business_id
   where c.slug = p_campaign_slug
     and b.slug = p_merchant_slug
     and c.status = 'active'
     and now() between c.starts_at and c.ends_at;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  -- Up to 100000 play attempts per campaign per 24h (event-scale traffic)
  if not check_rate_limit_window('d24:camp:' || v_campaign.id::text, 100000, 86400) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  -- Shared store WiFi: same IP can serve many unique phones in 24h
  if not check_rate_limit_window('d24:ipcamp:' || v_campaign.id::text || ':' || p_ip, 100000, 86400) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_device_id is not null and length(trim(p_device_id)) >= 8 then
    if not check_play_cooldown('cd:dev:' || trim(p_device_id), 5) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    if not check_play_cooldown('cd:devcamp:' || v_campaign.id::text || ':' || trim(p_device_id), 5) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end if;

  select b.* into v_business from businesses b
   where b.id = v_campaign.business_id and b.active = true;
  if not found then
    return jsonb_build_object('status', 'campaign_inactive');
  end if;

  select * into v_config from campaign_coupon_configs
   where campaign_id = v_campaign.id;
  v_has_config := found;

  if v_campaign.play_limit is not null then
    select count(*) into v_play_count from plays where campaign_id = v_campaign.id;
    if v_play_count >= v_campaign.play_limit then
      return jsonb_build_object('status', 'campaign_full');
    end if;
  end if;

  insert into customers (business_id, phone, name)
  values (v_campaign.business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id, (xmax = 0) into v_customer_id, v_is_new_customer;

  if v_is_new_customer then
    perform loyalty_award_signup_points(
      v_campaign.business_id, v_customer_id,
      'loyalty:earn:signup:' || v_customer_id::text
    );
  end if;

  select count(*) into v_prior_plays from plays
   where business_id = v_campaign.business_id and customer_id = v_customer_id;

  if exists (select 1 from plays
              where campaign_id = v_campaign.id and customer_id = v_customer_id) then
    return jsonb_build_object('status', 'already_played');
  end if;

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

  if v_has_config and v_config.win_mode = 'always' then
    v_prize_id := allocate_prize_always(v_campaign.id);
  else
    v_prize_id := allocate_prize(v_campaign.id);
  end if;
  if v_prize_id is not null then
    select * into v_prize from prizes where id = v_prize_id;
    v_won := true;
  end if;

  insert into plays (campaign_id, business_id, customer_id, won, prize_id)
  values (v_campaign.id, v_campaign.business_id, v_customer_id, v_won, v_prize_id)
  returning id into v_play_id;

  if not v_has_config then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'scratch', null, null,
                                  jsonb_build_object('source', v_source));
    perform record_campaign_event(v_campaign.business_id, v_campaign.id,
                                  'customer', v_customer_id,
                                  'scratch.completed',
                                  jsonb_build_object('won', v_won, 'source', v_source),
                                  p_ip, null);
  end if;

  if not v_won then
    perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                  'prize_lost', null, null,
                                  jsonb_build_object('source', v_source));
    return jsonb_build_object(
      'status', 'ok',
      'won', false,
      'defer_scratch_event', v_has_config);
  end if;

  if v_has_config then
    v_parent_gid := v_prize.shopify_parent_discount_id;
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal_fallback';
    v_needs_recon := true;
  else
    v_code := generate_coupon_code(coalesce(v_campaign.coupon_prefix, 'ONAM'));
    v_coupon_source := 'internal';
  end if;

  v_expires := least(now() + (v_prize.expiry_days || ' days')::interval,
                     v_campaign.ends_at + interval '15 days');
  insert into coupons (business_id, campaign_id, prize_id, customer_id,
                       play_id, code, prize_name, expires_at,
                       source, pool_id, shopify_parent_discount_id,
                       shopify_discount_code_id, needs_reconciliation)
  values (v_campaign.business_id, v_campaign.id, v_prize.id, v_customer_id,
          v_play_id, v_code, v_prize.name, v_expires,
          v_coupon_source, null, v_parent_gid,
          null, v_needs_recon)
  returning id into v_coupon_id;

  perform record_customer_event(v_campaign.business_id, v_campaign.id, v_customer_id,
                                'coupon_issued', v_prize.id, v_coupon_id,
                                jsonb_build_object('code', v_code, 'source', v_source,
                                                   'coupon_source', v_coupon_source));

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
                                  'couponSource', v_coupon_source,
                                  'prizeName', v_prize.name,
                                  'prizeType', v_prize.prize_type,
                                  'source', v_source),
                                p_ip, null);

  perform loyalty_award_campaign_play_points(
    v_campaign.business_id, v_customer_id, v_campaign.id, v_play_id,
    v_prize.prize_type, v_prize.prize_value
  );

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

  if v_has_config then
    v_redeem_online := v_parent_gid is not null;
    v_disc_type  := coalesce(v_prize.discount_type, v_config.discount_type);
    v_disc_value := coalesce(v_prize.discount_value, v_config.discount_value);
    if v_disc_type = 'percentage' then
      v_discount_summary := trim(to_char(v_disc_value, 'FM990.##')) || '% off';
    elsif v_disc_type = 'fixed_amount' then
      v_discount_summary := coalesce(v_config.currency, 'INR') || ' ' ||
                            trim(to_char(v_disc_value, 'FM999999990.##')) || ' off';
    end if;
    select 'https://' || s.shop_domain into v_store_url
      from shopify_shops s
     where s.business_id = v_campaign.business_id
     order by s.installed_at
     limit 1;
  end if;

  return jsonb_build_object(
    'status', 'ok', 'won', true,
    'campaign_id', v_campaign.id,
    'prize_id', v_prize.id,
    'prize_name', v_prize.name,
    'prize_type', v_prize.prize_type,
    'prize_value', v_prize.prize_value,
    'prize_image_url', v_prize.image_url,
    'prize_background_color', v_prize.background_color,
    'coupon_id', v_coupon_id,
    'coupon_code', v_code,
    'coupon_source', v_coupon_source,
    'shopify_parent_discount_id', v_parent_gid,
    'redeem_online', v_redeem_online,
    'discount_summary', v_discount_summary,
    'store_url', v_store_url,
    'expires_at', v_expires,
    'defer_scratch_event', v_has_config);
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_played');
end $$;

revoke execute on function play_campaign(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function play_campaign(text, text, text, text, text, text, text)
  from public, anon, authenticated;
