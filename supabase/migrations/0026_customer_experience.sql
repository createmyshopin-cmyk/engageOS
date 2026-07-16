-- =============================================================
-- 0026 — Customer Experience settings (V2 customer app)
--
-- Additive only. New exp_* columns on campaigns (all defaulted so
-- existing campaigns keep working unchanged), campaign_display
-- surfaces them for the customer app, and a service-role-only
-- merchant RPC updates them (same tenant-safety pattern as
-- merchant_update_redirect in 0023).
--
-- Redirect settings (redirect_*) from 0023 are untouched — the
-- experience settings compose with them (countdown/skip/button
-- text/native-app apply to the existing Post Win redirect).
-- =============================================================

-- 1. Experience columns ---------------------------------------
alter table campaigns
  add column if not exists exp_preloader_enabled boolean not null default true,
  add column if not exists exp_preloader_duration int not null default 600
    check (exp_preloader_duration in (300, 600, 1000)),
  add column if not exists exp_confetti_enabled boolean not null default true,
  add column if not exists exp_sound_enabled boolean not null default false,
  add column if not exists exp_haptics_enabled boolean not null default false,
  add column if not exists exp_open_native_app boolean not null default true,
  add column if not exists exp_show_countdown boolean not null default true,
  add column if not exists exp_allow_skip boolean not null default true,
  add column if not exists exp_button_text text
    check (exp_button_text is null or char_length(exp_button_text) <= 30),
  add column if not exists exp_theme text not null default 'dark'
    check (exp_theme in ('light', 'dark', 'brand'));

-- 2. campaign_display — add the 'experience' object. Everything
--    else is verbatim from 0023 (which itself extended 0022).
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
    'experience', jsonb_build_object(
      'preloader_enabled', c.exp_preloader_enabled,
      'preloader_duration', c.exp_preloader_duration,
      'confetti_enabled', c.exp_confetti_enabled,
      'sound_enabled', c.exp_sound_enabled,
      'haptics_enabled', c.exp_haptics_enabled,
      'open_native_app', c.exp_open_native_app,
      'show_countdown', c.exp_show_countdown,
      'allow_skip', c.exp_allow_skip,
      'button_text', c.exp_button_text,
      'theme', c.exp_theme
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

-- 3. merchant_update_experience — tenant safety enforced in SQL by
--    the campaign->business match. Service-role only.
create or replace function merchant_update_experience(
  p_business_id uuid,
  p_campaign_id uuid,
  p_preloader_enabled boolean,
  p_preloader_duration int,
  p_confetti_enabled boolean,
  p_sound_enabled boolean,
  p_haptics_enabled boolean,
  p_open_native_app boolean,
  p_show_countdown boolean,
  p_allow_skip boolean,
  p_button_text text,
  p_theme text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update campaigns c
     set exp_preloader_enabled = p_preloader_enabled,
         exp_preloader_duration = p_preloader_duration,
         exp_confetti_enabled = p_confetti_enabled,
         exp_sound_enabled = p_sound_enabled,
         exp_haptics_enabled = p_haptics_enabled,
         exp_open_native_app = p_open_native_app,
         exp_show_countdown = p_show_countdown,
         exp_allow_skip = p_allow_skip,
         exp_button_text = nullif(trim(coalesce(p_button_text, '')), ''),
         exp_theme = p_theme
   where c.id = p_campaign_id
     and c.business_id = p_business_id;
  if not found then
    raise exception 'campaign % not owned by business %', p_campaign_id, p_business_id;
  end if;
end $$;

revoke execute on function merchant_update_experience(
  uuid, uuid, boolean, int, boolean, boolean, boolean, boolean, boolean, boolean, text, text
) from public, anon, authenticated;
