alter table public.platform_ad_campaigns
  add column if not exists render_config jsonb;

comment on column public.platform_ad_campaigns.render_config is
  'Configuración visual opcional para banners compuestos de publicidad SELPA. Si es null, se usa render legacy por imagen.';
