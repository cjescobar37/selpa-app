alter table public.tournament_registrations
  add column if not exists admission_status text not null default 'NONE',
  add column if not exists admission_reason text,
  add column if not exists admission_by uuid references auth.users(id) on delete set null,
  add column if not exists admission_at timestamptz,
  add column if not exists eligibility_blocked_reason text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tournament_registrations_admission_status_chk'
  ) then
    alter table public.tournament_registrations
      add constraint tournament_registrations_admission_status_chk
      check (
        admission_status in (
          'NONE',
          'MANUAL_PAYMENT_VALIDATED',
          'PAY_AT_VENUE_APPROVED',
          'EXCEPTION_APPROVED',
          'BLOCKED'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_tournament_registrations_updated_at'
  ) then
    create trigger trg_tournament_registrations_updated_at
      before update on public.tournament_registrations
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
