alter table public.tournament_registrations
  add column if not exists preferred_slots jsonb null,
  add column if not exists availability_score integer null,
  add column if not exists flexibility_level text null;

alter table public.tournament_registration_change_requests
  add column if not exists refund_percent integer null,
  add column if not exists refund_policy_label text null,
  add column if not exists refund_metadata jsonb null;

