alter table public.platform_ad_campaigns
  drop constraint if exists platform_ad_campaigns_slot_check;

alter table public.platform_ad_campaigns
  add constraint platform_ad_campaigns_slot_check
  check (
    slot = any (
      array[
        'HOME_HERO'::text,
        'HOME_GRID'::text,
        'HOME_INLINE'::text,
        'HOME_AFTER_RANKING'::text,
        'HOME_AFTER_NEWS_HERO'::text
      ]
    )
  );
