-- Campaign banner OG thumbnails + dedicated storage bucket.
-- og_image_url is auto-generated from the banner upload (1200×630) for link previews.

alter table campaigns
  add column if not exists og_image_url text;

insert into storage.buckets (id, name, public)
values ('campaign-images', 'campaign-images', true)
on conflict (id) do nothing;

-- Surface banner + OG image on the public play page / metadata resolver.
create or replace function campaign_display(p_merchant_slug text, p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'campaign_id', c.id,
    'name', c.name,
    'headline', c.headline,
    'business_name', b.name,
    'logo_url', b.logo_url,
    'banner_url', c.banner_url,
    'og_image_url', c.og_image_url,
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
