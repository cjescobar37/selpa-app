-- Clubs v2 + club requests
alter table public.clubs
  add column if not exists brand_name text,
  add column if not exists legal_name text,
  add column if not exists cuit text,
  add column if not exists contact_email text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists province text,
  add column if not exists country text default 'Argentina',
  add column if not exists opening_hours text,
  add column if not exists courts_count integer,
  add column if not exists courts_surface text,
  add column if not exists logo_url text,
  add column if not exists notes text,
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists owner_phone text,
  add column if not exists owner_user_id uuid,
  add column if not exists rules_pdf_url text;

update public.clubs set cuit = regexp_replace(cuit, '\\D', '', 'g') where cuit is not null;

create unique index if not exists clubs_cuit_key on public.clubs(cuit) where cuit is not null and cuit <> '';
create index if not exists clubs_owner_user_id_idx on public.clubs(owner_user_id);
create index if not exists clubs_owner_email_idx on public.clubs(owner_email);
create index if not exists clubs_contact_email_idx on public.clubs(contact_email);

create table if not exists public.club_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  club_name text not null,
  brand_name text,
  legal_name text,
  cuit text,
  contact_email text not null,
  phone text,
  website text,
  instagram text,
  address text,
  city text,
  province text,
  country text default 'Argentina',
  opening_hours text,
  courts_count integer,
  courts_surface text,
  logo_url text,
  rules_pdf_url text,
  notes text,
  owner_name text not null,
  owner_email text not null,
  owner_phone text,
  status text not null default 'PENDING'
);

create index if not exists club_requests_status_idx on public.club_requests(status);
create index if not exists club_requests_owner_email_idx on public.club_requests(owner_email);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'club_requests_set_updated_at'
    ) THEN
      CREATE TRIGGER club_requests_set_updated_at
      BEFORE UPDATE ON public.club_requests
      FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
    END IF;
  ELSIF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'club_requests_set_updated_at'
    ) THEN
      CREATE TRIGGER club_requests_set_updated_at
      BEFORE UPDATE ON public.club_requests
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END IF;
END $$;
