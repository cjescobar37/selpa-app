alter table public.clubs
  add column if not exists mobile_phone text,
  add column if not exists description text,
  add column if not exists court_surfaces jsonb,
  add column if not exists opening_hours_json jsonb;
