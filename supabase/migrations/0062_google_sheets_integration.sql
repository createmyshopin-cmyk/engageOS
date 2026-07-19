-- =============================================================
-- EngageOS — Migration 0062: Google Sheets integration (Apps Script)
--
-- Merchants connect a Google Sheet via Apps Script that pulls customer
-- and coupon data using a per-tenant API key. The key is stored as a
-- SHA-256 hash (plaintext shown once at connect). RLS default-deny,
-- service-role only — mirrors wati_integrations from 0030.
-- =============================================================

create table if not exists google_sheets_integrations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null unique references businesses(id) on delete cascade,
  api_key_hash     text not null,
  api_key_prefix   text not null,
  status           text not null default 'connected'
                   check (status in ('connected', 'disconnected')),
  spreadsheet_url  text,
  last_sync_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Fast auth lookup: one active key per hash.
create unique index if not exists google_sheets_integrations_api_key_hash_idx
  on google_sheets_integrations (api_key_hash)
  where status = 'connected';

alter table google_sheets_integrations enable row level security;
revoke all on google_sheets_integrations from anon, authenticated;

-- ---------- Export RPC: all issued coupons for Sheets sync ----------

create or replace function merchant_list_coupons_for_export(
  p_business_id   uuid,
  p_limit         int,
  p_cursor_ts     timestamptz default null,
  p_cursor_id     uuid default null,
  p_status        text default null,
  p_campaign_id   uuid default null
) returns table (
  id                        uuid,
  code                      text,
  status                    text,
  prize_name                text,
  campaign_id               uuid,
  campaign_name             text,
  customer_id               uuid,
  customer_name             text,
  customer_phone            text,
  shopify_linked            boolean,
  shopify_discount_code_id  text,
  source                    text,
  created_at                timestamptz,
  redeemed_at               timestamptz,
  expires_at                timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    co.id,
    co.code,
    co.status,
    co.prize_name,
    co.campaign_id,
    cm.name as campaign_name,
    co.customer_id,
    cu.name as customer_name,
    cu.phone as customer_phone,
    (co.shopify_discount_code_id is not null and trim(co.shopify_discount_code_id) <> '') as shopify_linked,
    co.shopify_discount_code_id,
    co.source,
    co.created_at,
    co.redeemed_at,
    co.expires_at
  from coupons co
  join campaigns cm
    on cm.id = co.campaign_id
   and cm.business_id = p_business_id
  left join customers cu
    on cu.id = co.customer_id
   and cu.business_id = p_business_id
  where co.business_id = p_business_id
    and (
      p_status is null
      or trim(p_status) = ''
      or co.status = p_status
    )
    and (
      p_campaign_id is null
      or co.campaign_id = p_campaign_id
    )
    and (
      p_cursor_ts is null
      or p_cursor_id is null
      or (co.created_at < p_cursor_ts or (co.created_at = p_cursor_ts and co.id < p_cursor_id))
    )
  order by co.created_at desc, co.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function merchant_list_coupons_for_export(uuid, int, timestamptz, uuid, text, uuid)
  from public, anon, authenticated;
