-- =============================================================
-- EngageOS Release V1.1 — Migration 0023: Final Feature Build
--
-- Additive, non-destructive. Three feature groups:
--
--   FEATURE 2 — Traffic Sources: a merchant-defined named-source
--     registry (campaign_sources) so merchants can create/manage the
--     sources whose ?src= links they hand out. Analytics keep reading
--     from the immutable customer_events log (traffic_sources RPC,
--     migration 0020) — this table only names/curates them.
--
--   FEATURE 3 — Post Win Experience: redirect settings columns on
--     campaigns, surfaced through campaign_display so the customer play
--     flow can drive the countdown + auto-redirect, plus a merchant RPC
--     to update them under the campaign->business ownership join.
--
--   EVENTS — extend the campaign_events CHECK with the reward.*,
--     source.* and redirect.* lifecycle events named in the V1.1 spec.
--     Existing rows and the settings.updated reward pattern stay valid.
--
-- Lockdown matches the rest of the schema (0004/0016): RLS default-deny,
-- grants revoked from anon/authenticated, writers SECURITY DEFINER.
-- =============================================================

-- =============================================================
-- 1. Extend the campaign_events event_type CHECK (additive).
--    The 0016 constraint is an unnamed inline CHECK; Postgres named it
--    campaign_events_event_type_check. Drop + re-add with the superset.
-- =============================================================
alter table campaign_events
  drop constraint if exists campaign_events_event_type_check;

alter table campaign_events
  add constraint campaign_events_event_type_check check (event_type in (
    -- Campaign lifecycle
    'campaign.created', 'campaign.updated', 'campaign.published',
    'campaign.activated', 'campaign.paused', 'campaign.resumed',
    'campaign.ended', 'campaign.deleted', 'campaign.duplicated',
    'campaign.viewed', 'campaign.shared', 'campaign.archived',
    -- Distribution / print
    'qr.generated', 'qr.downloaded', 'poster.printed',
    -- Customer funnel
    'customer.scan', 'customer.registered',
    'scratch.started', 'scratch.completed',
    'prize.allocated', 'prize.exhausted',
    'coupon.generated', 'coupon.redeemed', 'gift.claimed',
    -- WhatsApp lifecycle
    'whatsapp.queue', 'whatsapp.sent', 'whatsapp.delivered',
    'whatsapp.read', 'whatsapp.failed',
    -- Exports
    'csv.export', 'customer.export',
    -- Account / settings
    'merchant.login', 'settings.updated', 'analytics.viewed',
    -- V1.1: Rewards manager
    'reward.created', 'reward.updated', 'reward.deleted',
    -- V1.1: Traffic sources
    'source.created', 'source.updated', 'source.deleted',
    -- V1.1: Post Win redirect (merchant config + customer experience)
    'redirect.enabled', 'redirect.disabled', 'redirect.updated',
    'redirect.started', 'redirect.opened',
    'redirect.completed', 'redirect.cancelled',
    'reward.viewed', 'reward.claimed'
  ));

-- =============================================================
-- 2. Post Win Experience settings on campaigns (all nullable/defaulted,
--    so existing campaigns keep working unchanged — redirect disabled).
-- =============================================================
alter table campaigns
  add column if not exists redirect_enabled boolean not null default false,
  add column if not exists redirect_delay int not null default 5
    check (redirect_delay in (0, 3, 5, 10, 15, 30)),
  add column if not exists redirect_destination_type text not null default 'none'
    check (redirect_destination_type in (
      'none', 'website', 'product', 'instagram', 'facebook',
      'youtube', 'tiktok', 'whatsapp', 'telegram', 'custom'
    )),
  add column if not exists redirect_url text
    check (redirect_url is null or char_length(redirect_url) <= 2048);

-- =============================================================
-- 3. campaign_display — surface the redirect settings so the customer
--    play flow can drive the Post Win countdown/redirect. Every other
--    field and the (merchant_slug, campaign_slug) resolution is verbatim
--    from 0022; only the redirect object is added.
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
    'redirect', jsonb_build_object(
      'enabled', c.redirect_enabled,
      'delay', c.redirect_delay,
      'destination_type', c.redirect_destination_type,
      'url', c.redirect_url
    ),
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
-- 4. merchant_update_redirect — update one campaign's Post Win settings.
--    Ownership is enforced in SQL by the campaign->business join, so
--    tenant safety never depends on the caller. Service-role only.
-- =============================================================
create or replace function merchant_update_redirect(
  p_business_id uuid,
  p_campaign_id uuid,
  p_enabled boolean,
  p_delay int,
  p_destination_type text,
  p_url text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update campaigns c
     set redirect_enabled = p_enabled,
         redirect_delay = p_delay,
         redirect_destination_type = p_destination_type,
         redirect_url = nullif(trim(coalesce(p_url, '')), '')
   where c.id = p_campaign_id
     and c.business_id = p_business_id;
  if not found then
    raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
  end if;
end $$;

revoke execute on function merchant_update_redirect(uuid, uuid, boolean, int, text, text)
  from public, anon, authenticated;

-- =============================================================
-- 5. Traffic Sources registry — merchant-defined named sources. Analytics
--    still aggregate from customer_events (traffic_sources RPC); this table
--    only lets merchants curate the source names whose ?src= links they
--    print/share. business_id-scoped; slug is normalized by the caller and
--    unique per business.
-- =============================================================
create table if not exists campaign_sources (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  -- campaign_id nullable: a source can be tenant-wide or campaign-specific.
  campaign_id  uuid references campaigns(id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9_-]{1,40}$'),
  label        text not null check (char_length(label) between 1 and 60),
  created_at   timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists campaign_sources_business_idx
  on campaign_sources (business_id, created_at desc);

alter table campaign_sources enable row level security;
revoke all on campaign_sources from anon, authenticated;

-- =============================================================
-- 6. Source registry mutators — service-role only, ownership in SQL.
-- =============================================================
create or replace function merchant_create_source(
  p_business_id uuid,
  p_campaign_id uuid,
  p_slug text,
  p_label text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- If a campaign is named, it must belong to this business.
  if p_campaign_id is not null and not exists (
    select 1 from campaigns where id = p_campaign_id and business_id = p_business_id
  ) then
    raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
  end if;

  insert into campaign_sources (business_id, campaign_id, slug, label)
  values (p_business_id, p_campaign_id, p_slug, p_label)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function merchant_create_source(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function merchant_delete_source(
  p_business_id uuid,
  p_source_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from campaign_sources
   where id = p_source_id and business_id = p_business_id;
  if not found then
    raise exception 'source % not owned by business %', p_source_id, p_business_id;
  end if;
end $$;

revoke execute on function merchant_delete_source(uuid, uuid)
  from public, anon, authenticated;

-- =============================================================
-- 7. merchant_sources — list a business's defined sources joined with
--    live analytics from the immutable customer_events log, so the
--    merchant dashboard shows Source/Scans/Registrations/Plays/Wins/
--    Redemptions/Conversion for each curated source in one round-trip.
--    Sources that exist in the registry but have no traffic yet still
--    appear (zero rows), and traffic under undefined sources is not lost —
--    the dashboard's traffic_sources RPC (0020) still surfaces those.
-- =============================================================
create or replace function merchant_sources(p_business_id uuid)
returns table (
  id            uuid,
  campaign_id   uuid,
  slug          text,
  label         text,
  qr_scans      bigint,
  registrations bigint,
  plays         bigint,
  wins          bigint,
  redemptions   bigint,
  created_at    timestamptz
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select coalesce(nullif(trim(e.metadata->>'source'), ''), 'direct') as src,
           count(*) filter (where e.event_type = 'qr_scan')         as qr_scans,
           count(*) filter (where e.event_type = 'registration')    as registrations,
           count(*) filter (where e.event_type = 'scratch')         as plays,
           count(*) filter (where e.event_type = 'prize_won')       as wins,
           count(*) filter (where e.event_type = 'coupon_redeemed') as redemptions
      from customer_events e
     where e.business_id = p_business_id
     group by 1
  )
  select s.id, s.campaign_id, s.slug, s.label,
         coalesce(a.qr_scans, 0), coalesce(a.registrations, 0),
         coalesce(a.plays, 0), coalesce(a.wins, 0), coalesce(a.redemptions, 0),
         s.created_at
    from campaign_sources s
    left join agg a on a.src = s.slug
   where s.business_id = p_business_id
   order by s.created_at desc
$$;

revoke execute on function merchant_sources(uuid)
  from public, anon, authenticated;
