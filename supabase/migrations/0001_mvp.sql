-- =============================================================
-- EngageOS MVP — Migration 0001
-- 6 core tables + rate limiting + atomic play engine.
-- All customer-facing writes go through SECURITY DEFINER functions
-- called from server route handlers (service role). Anon key can
-- only read active campaign display data.
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- Businesses (tenants) ----------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  phone text not null,                       -- owner's WhatsApp, E.164
  city text,
  logo_url text,
  staff_pin text not null,                   -- 4-6 digit PIN for /redeem (hashed at app layer)
  merchant_token uuid not null default gen_random_uuid() unique, -- magic-link for /m/[token]
  wa_messages_sent int not null default 0,   -- COGS counter
  wa_messages_quota int not null default 1000,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Campaigns ----------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'), -- global: /c/[slug]
  headline text not null default 'Scratch & Win',
  status text not null default 'draft' check (status in ('draft','active','ended')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index campaigns_business_idx on campaigns (business_id);

-- ---------- Prizes ----------
create table prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name text not null,                        -- "10% OFF"
  weight int not null check (weight >= 0),   -- relative win weight; 0 = disabled
  total_quantity int not null check (total_quantity >= 0),
  won_count int not null default 0,
  expiry_days int not null default 15,
  created_at timestamptz not null default now()
);
create index prizes_campaign_idx on prizes (campaign_id);

-- ---------- Customers (per business, keyed by phone) ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);
create index customers_business_idx on customers (business_id, created_at desc);

-- ---------- Plays ----------
create table plays (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  won boolean not null,
  prize_id uuid references prizes(id),
  created_at timestamptz not null default now(),
  unique (campaign_id, customer_id)          -- one play per customer per campaign, DB-enforced
);
create index plays_business_idx on plays (business_id, created_at desc);

-- ---------- Coupons ----------
create table coupons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  prize_id uuid not null references prizes(id),
  customer_id uuid not null references customers(id) on delete cascade,
  play_id uuid not null references plays(id) unique,
  code text not null unique,                 -- ONAM-XXXX, human-typable
  prize_name text not null,                  -- denormalized snapshot: prize edits must not alter issued coupons
  status text not null default 'issued' check (status in ('issued','redeemed','expired')),
  wa_status text not null default 'pending' check (wa_status in ('pending','sent','failed')),
  wa_attempts int not null default 0,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index coupons_business_status_idx on coupons (business_id, status);
create index coupons_wa_pending_idx on coupons (wa_status) where wa_status = 'pending';

-- ---------- Rate limits (fixed-window counters, no Redis) ----------
create table rate_limits (
  key text not null,                         -- e.g. 'ip:1.2.3.4:2026071518'
  count int not null default 1,
  window_start timestamptz not null default now(),
  primary key (key)
);

-- =============================================================
-- RLS: default deny. Anon may read active campaign display data.
-- Everything else is service-role only (server route handlers).
-- =============================================================
alter table businesses enable row level security;
alter table campaigns enable row level security;
alter table prizes enable row level security;
alter table customers enable row level security;
alter table plays enable row level security;
alter table coupons enable row level security;
alter table rate_limits enable row level security;

create policy "anon read active campaigns" on campaigns
  for select using (status = 'active' and now() between starts_at and ends_at);
create policy "anon read business display" on businesses
  for select using (active = true);
-- NOTE: no anon policy on prizes — odds and inventory are never client-readable.
-- Play page shows prize names via campaign_display() below.

-- =============================================================
-- Public display function: prize names only, no weights/quantities
-- =============================================================
create or replace function campaign_display(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'campaign_id', c.id,
    'name', c.name,
    'headline', c.headline,
    'business_name', b.name,
    'logo_url', b.logo_url,
    'ends_at', c.ends_at,
    'prizes', (select coalesce(jsonb_agg(p.name order by p.weight desc), '[]'::jsonb)
               from prizes p where p.campaign_id = c.id and p.weight > 0)
  )
  from campaigns c
  join businesses b on b.id = c.business_id
  where c.slug = p_slug
    and c.status = 'active'
    and now() between c.starts_at and c.ends_at
    and b.active = true
$$;

-- =============================================================
-- Rate limit: fixed hourly window. Returns true if allowed.
-- =============================================================
create or replace function check_rate_limit(p_key text, p_max int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when rate_limits.window_start < now() - interval '1 hour'
                     then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < now() - interval '1 hour'
                            then now() else rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

-- =============================================================
-- Coupon code generator: ONAM-XXXX (unambiguous alphabet)
-- =============================================================
create or replace function generate_coupon_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  v_code text;
  i int;
begin
  loop
    v_code := 'ONAM-';
    for i in 1..4 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * 31)::int, 1);
    end loop;
    exit when not exists (select 1 from coupons where code = v_code);
  end loop;
  return v_code;
end $$;

-- =============================================================
-- THE PLAY ENGINE — one transaction, all invariants enforced here.
-- Returns jsonb: {status, won, prize_name?, coupon_code?, expires_at?}
-- status: ok | already_played | campaign_inactive | rate_limited
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
    v_code := generate_coupon_code();
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
    -- Concurrent double-submit of the same phone: plays unique index fired.
    return jsonb_build_object('status', 'already_played');
end $$;

-- =============================================================
-- Redemption — atomic, PIN-scoped to the business.
-- Returns: {status, prize_name?, customer_name?, redeemed_at?}
-- status: redeemed | invalid_code | already_redeemed | expired | wrong_business
-- =============================================================
create or replace function redeem_coupon(
  p_business_id uuid,
  p_code text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_coupon coupons%rowtype;
  v_customer_name text;
begin
  select * into v_coupon from coupons
   where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('status', 'invalid_code');
  end if;
  if v_coupon.business_id <> p_business_id then
    return jsonb_build_object('status', 'wrong_business');
  end if;
  if v_coupon.status = 'redeemed' then
    return jsonb_build_object('status', 'already_redeemed',
                              'redeemed_at', v_coupon.redeemed_at);
  end if;
  if v_coupon.expires_at < now() or v_coupon.status = 'expired' then
    return jsonb_build_object('status', 'expired');
  end if;

  update coupons set status = 'redeemed', redeemed_at = now()
   where id = v_coupon.id;

  select name into v_customer_name from customers where id = v_coupon.customer_id;

  return jsonb_build_object(
    'status', 'redeemed',
    'prize_name', v_coupon.prize_name,
    'customer_name', v_customer_name,
    'redeemed_at', now());
end $$;

-- =============================================================
-- Function privileges: server-only (service_role). The anon key
-- may call campaign_display() only. play/redeem/rate-limit are
-- invoked exclusively from route handlers with the service role,
-- which validate input and attach the caller's IP.
-- =============================================================
revoke execute on function play_campaign(text, text, text, text) from public, anon, authenticated;
revoke execute on function redeem_coupon(uuid, text) from public, anon, authenticated;
revoke execute on function check_rate_limit(text, int) from public, anon, authenticated;
revoke execute on function generate_coupon_code() from public, anon, authenticated;
grant execute on function campaign_display(text) to anon, authenticated;
