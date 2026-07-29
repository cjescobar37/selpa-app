begin;

do $$
begin
  if to_regclass('public.competition_player_entries') is null then
    raise exception 'Primero debe aplicarse Competition Engine Stage 2';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.competition_divisions'::regclass
      and c.conname = 'competition_divisions_club_id_id_key'
  ) then
    alter table public.competition_divisions
      add constraint competition_divisions_club_id_id_key unique (club_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.competition_player_entries'::regclass
      and c.conname = 'competition_player_entries_club_id_id_key'
  ) then
    alter table public.competition_player_entries
      add constraint competition_player_entries_club_id_id_key unique (club_id, id);
  end if;
end
$$;

create table if not exists public.competition_point_transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null,
  division_id uuid not null,
  player_entry_id uuid not null,
  club_player_id uuid not null,
  transaction_type text not null,
  source_type text not null,
  source_id uuid,
  source_concept text not null,
  idempotency_key text not null,
  points integer not null,
  effective_at timestamptz not null,
  reason text,
  rule_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  reversed_transaction_id uuid references public.competition_point_transactions(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint competition_point_transactions_season_fkey foreign key (club_id, season_id)
    references public.competition_seasons(club_id, id) on delete restrict,
  constraint competition_point_transactions_division_fkey foreign key (club_id, division_id)
    references public.competition_divisions(club_id, id) on delete restrict,
  constraint competition_point_transactions_entry_fkey foreign key (club_id, player_entry_id)
    references public.competition_player_entries(club_id, id) on delete restrict,
  constraint competition_point_transactions_player_fkey foreign key (club_id, club_player_id)
    references public.club_players(club_id, id) on delete restrict,
  constraint competition_point_transactions_type_chk check (transaction_type in (
    'OPENING_BALANCE', 'TOURNAMENT_RESULT', 'RECONCILIATION',
    'MANUAL_ADJUSTMENT', 'REVERSAL', 'SYSTEM_CORRECTION'
  )),
  constraint competition_point_transactions_source_chk check (source_type in (
    'LEGACY_OPENING_BALANCE', 'TOURNAMENT', 'MANUAL', 'SYSTEM'
  )),
  constraint competition_point_transactions_points_chk check (points <> 0),
  constraint competition_point_transactions_source_concept_chk check (length(btrim(source_concept)) > 0),
  constraint competition_point_transactions_idempotency_chk check (length(btrim(idempotency_key)) > 0),
  constraint competition_point_transactions_reason_chk check (reason is null or length(btrim(reason)) > 0),
  constraint competition_point_transactions_rule_snapshot_chk check (jsonb_typeof(rule_snapshot) = 'object'),
  constraint competition_point_transactions_metadata_chk check (jsonb_typeof(metadata) = 'object'),
  constraint competition_point_transactions_not_self_reversal_chk check (
    reversed_transaction_id is null or reversed_transaction_id <> id
  ),
  constraint competition_point_transactions_reversal_shape_chk check (
    (transaction_type = 'REVERSAL' and reversed_transaction_id is not null)
    or (transaction_type <> 'REVERSAL' and reversed_transaction_id is null)
  ),
  constraint competition_point_transactions_actor_chk check (
    transaction_type not in ('MANUAL_ADJUSTMENT', 'REVERSAL') or created_by is not null
  ),
  constraint competition_point_transactions_idempotency_key_key unique (idempotency_key),
  constraint competition_point_transactions_reversed_transaction_id_key unique (reversed_transaction_id)
);

create unique index if not exists competition_point_transactions_opening_balance_uidx
  on public.competition_point_transactions
    (club_id, season_id, division_id, player_entry_id, transaction_type)
  where transaction_type = 'OPENING_BALANCE';

create index if not exists competition_point_transactions_aggregate_idx
  on public.competition_point_transactions (club_id, season_id, division_id, player_entry_id);

create index if not exists competition_point_transactions_player_idx
  on public.competition_point_transactions (club_id, club_player_id, effective_at desc);

create index if not exists competition_point_transactions_source_idx
  on public.competition_point_transactions (source_type, source_id)
  where source_id is not null;

create index if not exists competition_point_transactions_type_effective_idx
  on public.competition_point_transactions (transaction_type, effective_at desc);

create or replace function public.validate_competition_point_transaction()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_entry record;
  v_original public.competition_point_transactions%rowtype;
begin
  if current_setting('selpa.competition_points_write', true) is distinct from 'allowed' then
    raise exception 'Los movimientos de puntos solo pueden crearse mediante operaciones autorizadas.' using errcode = '42501';
  end if;

  select entry.club_id, entry.club_player_id, entry.division_id, entry.status,
         entry.valid_until, division.season_id, division.modality, division.segment_id
  into v_entry
  from public.competition_player_entries entry
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  where entry.id = new.player_entry_id;

  if not found then
    raise exception 'Entrada competitiva inexistente.' using errcode = '23503';
  end if;
  if v_entry.club_id <> new.club_id
     or v_entry.club_player_id <> new.club_player_id
     or v_entry.division_id <> new.division_id
     or v_entry.season_id <> new.season_id then
    raise exception 'Club, temporada, división, entrada y jugador no pertenecen al mismo recorrido.' using errcode = '23514';
  end if;
  if v_entry.modality <> 'INDIVIDUAL' then
    raise exception 'Stage 4 solo admite entradas individuales.' using errcode = '23514';
  end if;
  if (v_entry.status <> 'ACTIVE' or v_entry.valid_until is not null)
     and new.transaction_type not in ('REVERSAL', 'MANUAL_ADJUSTMENT', 'SYSTEM_CORRECTION') then
    raise exception 'La entrada competitiva no está activa.' using errcode = '23514';
  end if;

  if new.transaction_type = 'OPENING_BALANCE' then
    if new.source_type <> 'LEGACY_OPENING_BALANCE' or new.source_id is not null then
      raise exception 'Origen inválido para OPENING_BALANCE.' using errcode = '23514';
    end if;
  end if;

  if new.transaction_type = 'REVERSAL' then
    select * into v_original
    from public.competition_point_transactions original
    where original.id = new.reversed_transaction_id
    for update;
    if not found then
      raise exception 'Movimiento original inexistente.' using errcode = '23503';
    end if;
    if v_original.transaction_type = 'REVERSAL' then
      raise exception 'Una reversión no puede revertirse directamente.' using errcode = '23514';
    end if;
    if v_original.club_id <> new.club_id
       or v_original.season_id <> new.season_id
       or v_original.division_id <> new.division_id
       or v_original.player_entry_id <> new.player_entry_id
       or v_original.club_player_id <> new.club_player_id
       or new.points <> -v_original.points then
      raise exception 'La reversión no compensa exactamente al movimiento original.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.reject_competition_point_transaction_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Los movimientos de puntos son inmutables; use una corrección o reversión.' using errcode = '42501';
end;
$$;

drop trigger if exists trg_validate_competition_point_transaction on public.competition_point_transactions;
create trigger trg_validate_competition_point_transaction
  before insert on public.competition_point_transactions
  for each row execute function public.validate_competition_point_transaction();

drop trigger if exists trg_reject_competition_point_transaction_mutation on public.competition_point_transactions;
create trigger trg_reject_competition_point_transaction_mutation
  before update or delete on public.competition_point_transactions
  for each row execute function public.reject_competition_point_transaction_mutation();

alter table public.competition_point_transactions enable row level security;
revoke all on table public.competition_point_transactions from public, anon, authenticated;

drop policy if exists competition_point_transactions_select_authorized on public.competition_point_transactions;
create policy competition_point_transactions_select_authorized
  on public.competition_point_transactions for select to authenticated
  using (public.is_platform_admin() or public.has_club_capability(club_id, 'ranking:view'));

revoke all on function public.validate_competition_point_transaction() from public, anon, authenticated;
revoke all on function public.reject_competition_point_transaction_mutation() from public, anon, authenticated;
grant execute on function public.validate_competition_point_transaction() to service_role;
grant execute on function public.reject_competition_point_transaction_mutation() to service_role;

comment on table public.competition_point_transactions is
  'Ledger inmutable de puntos individuales por temporada, división y entrada competitiva.';
comment on column public.competition_point_transactions.rule_snapshot is
  'Copia inmutable de la regla aplicada; OPENING_BALANCE declara explícitamente que no fue reconstruido.';
comment on column public.competition_point_transactions.effective_at is
  'Momento real del movimiento. El backfill legacy usa la fecha de ejecución, no el inicio de temporada.';

commit;
