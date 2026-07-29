begin;

do $$
begin
  if to_regclass('public.competition_point_transactions') is null then
    raise exception 'Primero debe aplicarse 20260729_competition_points_ledger_stage4.sql';
  end if;
end
$$;

create or replace function public.competition_points_server_authorized(p_club_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    session_user = 'postgres'
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.is_platform_admin()
    or public.has_club_capability(p_club_id, p_capability);
$$;

create or replace function public.create_competition_opening_balance(p_player_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row record;
  v_existing uuid;
  v_created uuid;
  v_key text;
  v_now timestamptz := clock_timestamp();
begin
  select entry.id as player_entry_id, entry.club_id, entry.club_player_id,
         entry.division_id, entry.status as entry_status, entry.valid_until,
         division.season_id, division.modality, division.segment_id, division.is_active,
         season.status as season_status, player.approved_at,
         coalesce(player.ranking_points, 0)::integer as legacy_points
  into v_row
  from public.competition_player_entries entry
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  join public.competition_seasons season
    on season.id = division.season_id and season.club_id = division.club_id
  join public.club_players player
    on player.id = entry.club_player_id and player.club_id = entry.club_id
  where entry.id = p_player_entry_id;

  if not found then raise exception 'Entrada competitiva inexistente.' using errcode = 'P0002'; end if;
  if not public.competition_points_server_authorized(v_row.club_id, 'ranking:manage') then
    raise exception 'Sin permisos para migrar puntos.' using errcode = '42501';
  end if;
  if v_row.season_status <> 'ACTIVE' or not v_row.is_active
     or v_row.modality <> 'INDIVIDUAL' or v_row.segment_id is not null
     or v_row.entry_status <> 'ACTIVE' or v_row.valid_until is not null
     or v_row.approved_at is null then
    raise exception 'La entrada no es elegible para OPENING_BALANCE.' using errcode = '23514';
  end if;

  select point_tx.id into v_existing
  from public.competition_point_transactions point_tx
  where point_tx.club_id = v_row.club_id
    and point_tx.season_id = v_row.season_id
    and point_tx.division_id = v_row.division_id
    and point_tx.player_entry_id = v_row.player_entry_id
    and point_tx.transaction_type = 'OPENING_BALANCE';
  if found then
    return jsonb_build_object('status', 'EXISTS', 'transaction_id', v_existing, 'legacy_points', v_row.legacy_points);
  end if;
  if v_row.legacy_points = 0 then
    return jsonb_build_object('status', 'SKIPPED_ZERO', 'transaction_id', null, 'legacy_points', 0);
  end if;

  v_key := format('opening-balance:%s:%s:%s:%s:v1', v_row.club_id, v_row.season_id, v_row.division_id, v_row.player_entry_id);
  perform set_config('selpa.competition_points_write', 'allowed', true);
  insert into public.competition_point_transactions (
    club_id, season_id, division_id, player_entry_id, club_player_id,
    transaction_type, source_type, source_concept, idempotency_key, points,
    effective_at, reason, rule_snapshot, metadata, created_by
  ) values (
    v_row.club_id, v_row.season_id, v_row.division_id, v_row.player_entry_id, v_row.club_player_id,
    'OPENING_BALANCE', 'LEGACY_OPENING_BALANCE', 'LEGACY_TOTAL_V1', v_key, v_row.legacy_points,
    v_now, 'Saldo legacy inicial; no reconstruido desde torneos.',
    jsonb_build_object('kind', 'legacy_opening_balance', 'source_column', 'club_players.ranking_points', 'reconstructed', false, 'version', 1),
    jsonb_build_object('legacy_value', v_row.legacy_points, 'backfill_version', 1, 'executed_at', v_now),
    null
  )
  on conflict (idempotency_key) do nothing
  returning id into v_created;

  if v_created is null then
    select point_tx.id into v_created
    from public.competition_point_transactions point_tx
    where point_tx.idempotency_key = v_key;
    return jsonb_build_object('status', 'EXISTS', 'transaction_id', v_created, 'legacy_points', v_row.legacy_points);
  end if;
  return jsonb_build_object('status', 'CREATED', 'transaction_id', v_created, 'legacy_points', v_row.legacy_points);
end;
$$;

create or replace function public.reverse_competition_point_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_original public.competition_point_transactions%rowtype;
  v_existing uuid;
  v_actor uuid := auth.uid();
  v_created uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_now timestamptz := clock_timestamp();
begin
  select * into v_original
  from public.competition_point_transactions point_tx
  where point_tx.id = p_transaction_id
  for update;
  if not found then raise exception 'Movimiento inexistente.' using errcode = 'P0002'; end if;
  if not public.competition_points_server_authorized(v_original.club_id, 'ranking:manage') then
    raise exception 'Sin permisos para revertir puntos.' using errcode = '42501';
  end if;
  if v_original.transaction_type = 'REVERSAL' then
    raise exception 'Una reversión no puede revertirse directamente.' using errcode = '23514';
  end if;
  if v_reason is null then raise exception 'La reversión requiere un motivo.' using errcode = '22023'; end if;

  if v_actor is null then v_actor := p_actor_id; end if;
  if auth.uid() is not null and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'El actor no coincide con la sesión.' using errcode = '42501';
  end if;
  if v_actor is null then raise exception 'La reversión requiere un actor.' using errcode = '22023'; end if;

  select point_tx.id into v_existing
  from public.competition_point_transactions point_tx
  where point_tx.reversed_transaction_id = v_original.id;
  if found then
    return jsonb_build_object('status', 'EXISTS', 'transaction_id', v_existing, 'reversed_transaction_id', v_original.id);
  end if;

  perform set_config('selpa.competition_points_write', 'allowed', true);
  insert into public.competition_point_transactions (
    club_id, season_id, division_id, player_entry_id, club_player_id,
    transaction_type, source_type, source_id, source_concept, idempotency_key,
    points, effective_at, reason, rule_snapshot, metadata,
    reversed_transaction_id, created_by
  ) values (
    v_original.club_id, v_original.season_id, v_original.division_id,
    v_original.player_entry_id, v_original.club_player_id,
    'REVERSAL', 'SYSTEM', v_original.id, 'REVERSAL',
    format('reversal:%s:v1', v_original.id), -v_original.points, v_now, v_reason,
    v_original.rule_snapshot,
    jsonb_build_object('original_transaction_id', v_original.id, 'executed_at', v_now),
    v_original.id, v_actor
  )
  on conflict (idempotency_key) do nothing
  returning id into v_created;

  if v_created is null then
    select point_tx.id into v_created
    from public.competition_point_transactions point_tx
    where point_tx.reversed_transaction_id = v_original.id;
    return jsonb_build_object('status', 'EXISTS', 'transaction_id', v_created, 'reversed_transaction_id', v_original.id);
  end if;
  return jsonb_build_object('status', 'CREATED', 'transaction_id', v_created, 'reversed_transaction_id', v_original.id);
end;
$$;

create or replace function public.get_competition_points_totals(
  p_club_id uuid,
  p_season_id uuid,
  p_division_id uuid default null
)
returns table(player_entry_id uuid, club_player_id uuid, division_id uuid, total_points bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.competition_points_server_authorized(p_club_id, 'ranking:view') then
    raise exception 'Sin permisos para consultar puntos.' using errcode = '42501';
  end if;
  return query
  select entry.id, entry.club_player_id, entry.division_id,
         coalesce(sum(point_tx.points), 0)::bigint
  from public.competition_player_entries entry
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  join public.club_players player
    on player.id = entry.club_player_id and player.club_id = entry.club_id
  left join public.competition_point_transactions point_tx
    on point_tx.club_id = entry.club_id
   and point_tx.season_id = division.season_id
   and point_tx.division_id = entry.division_id
   and point_tx.player_entry_id = entry.id
  where entry.club_id = p_club_id
    and division.season_id = p_season_id
    and (p_division_id is null or entry.division_id = p_division_id)
    and division.modality = 'INDIVIDUAL'
    and division.segment_id is null
    and division.is_active
    and entry.status = 'ACTIVE'
    and entry.valid_until is null
    and player.approved_at is not null
  group by entry.id, entry.club_player_id, entry.division_id
  order by entry.division_id, entry.id;
end;
$$;

create or replace function public.backfill_competition_opening_balances(
  p_club_id uuid,
  p_season_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_entry record;
  v_created integer := 0;
  v_already_existing_before integer := 0;
begin
  if not public.competition_points_server_authorized(p_club_id, 'ranking:manage') then
    raise exception 'Sin permisos para ejecutar el backfill.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.competition_seasons season
    where season.id = p_season_id and season.club_id = p_club_id and season.status = 'ACTIVE'
  ) then
    raise exception 'La temporada indicada no está ACTIVE para el club.' using errcode = '23514';
  end if;

  select count(*) into v_already_existing_before
  from public.competition_point_transactions point_tx
  join public.competition_player_entries entry
    on entry.id = point_tx.player_entry_id and entry.club_id = point_tx.club_id
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  join public.club_players player
    on player.id = entry.club_player_id and player.club_id = entry.club_id
  where point_tx.club_id = p_club_id
    and point_tx.season_id = p_season_id
    and point_tx.transaction_type = 'OPENING_BALANCE'
    and division.modality = 'INDIVIDUAL'
    and division.segment_id is null
    and division.is_active
    and entry.status = 'ACTIVE'
    and entry.valid_until is null
    and player.approved_at is not null;

  if not p_dry_run then
    for v_entry in
      select entry.id
      from public.competition_player_entries entry
      join public.competition_divisions division
        on division.id = entry.division_id and division.club_id = entry.club_id
      join public.club_players player
        on player.id = entry.club_player_id and player.club_id = entry.club_id
      where entry.club_id = p_club_id and division.season_id = p_season_id
        and division.modality = 'INDIVIDUAL' and division.segment_id is null and division.is_active
        and entry.status = 'ACTIVE' and entry.valid_until is null and player.approved_at is not null
      order by entry.id
    loop
      if (public.create_competition_opening_balance(v_entry.id)->>'status') = 'CREATED' then
        v_created := v_created + 1;
      end if;
    end loop;
  end if;

  with eligible as (
    select entry.id, entry.club_player_id, entry.division_id,
           coalesce(player.ranking_points, 0)::integer as legacy_points
    from public.competition_player_entries entry
    join public.competition_divisions division
      on division.id = entry.division_id and division.club_id = entry.club_id
    join public.club_players player
      on player.id = entry.club_player_id and player.club_id = entry.club_id
    where entry.club_id = p_club_id and division.season_id = p_season_id
      and division.modality = 'INDIVIDUAL' and division.segment_id is null and division.is_active
      and entry.status = 'ACTIVE' and entry.valid_until is null and player.approved_at is not null
  ), existing as (
    select point_tx.player_entry_id
    from public.competition_point_transactions point_tx
    where point_tx.club_id = p_club_id and point_tx.season_id = p_season_id
      and point_tx.transaction_type = 'OPENING_BALANCE'
  )
  select jsonb_build_object(
    'dry_run', p_dry_run,
    'eligible_entries', count(*),
    'opening_balances_to_create', count(*) filter (where eligible.legacy_points <> 0 and existing.player_entry_id is null),
    'already_existing', v_already_existing_before,
    'zero_points_skipped', count(*) filter (where eligible.legacy_points = 0),
    'missing_club_players', (
      select count(*)
      from public.competition_player_entries entry
      join public.competition_divisions division
        on division.id = entry.division_id and division.club_id = entry.club_id
      left join public.club_players player
        on player.id = entry.club_player_id and player.club_id = entry.club_id
      where entry.club_id = p_club_id and division.season_id = p_season_id and player.id is null
    ),
    'invalid_entries', (
      select count(*)
      from public.competition_player_entries entry
      join public.competition_divisions division
        on division.id = entry.division_id and division.club_id = entry.club_id
      left join public.club_players player
        on player.id = entry.club_player_id and player.club_id = entry.club_id
      where entry.club_id = p_club_id and division.season_id = p_season_id
        and not (
          division.modality = 'INDIVIDUAL' and division.segment_id is null and division.is_active
          and entry.status = 'ACTIVE' and entry.valid_until is null and player.approved_at is not null
        )
    ),
    'excluded_without_entry', (
      select count(*) from public.club_players player
      where player.club_id = p_club_id and player.approved_at is not null
        and not exists (select 1 from eligible e where e.club_player_id = player.id)
    ),
    'legacy_total_to_migrate', coalesce(sum(eligible.legacy_points), 0),
    'created', v_created
  ) into v_result
  from eligible left join existing on existing.player_entry_id = eligible.id;
  return v_result;
end;
$$;

revoke all on function public.competition_points_server_authorized(uuid, text) from public, anon, authenticated;
revoke all on function public.create_competition_opening_balance(uuid) from public, anon;
revoke all on function public.reverse_competition_point_transaction(uuid, text, uuid) from public, anon;
revoke all on function public.get_competition_points_totals(uuid, uuid, uuid) from public, anon;
revoke all on function public.backfill_competition_opening_balances(uuid, uuid, boolean) from public, anon;

grant execute on function public.competition_points_server_authorized(uuid, text) to service_role;
grant execute on function public.create_competition_opening_balance(uuid) to authenticated, service_role;
grant execute on function public.reverse_competition_point_transaction(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.get_competition_points_totals(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.backfill_competition_opening_balances(uuid, uuid, boolean) to authenticated, service_role;

comment on function public.backfill_competition_opening_balances(uuid, uuid, boolean) is
  'Backfill controlado e idempotente. Dry-run por defecto; nunca crea entries ni modifica ranking_points.';

commit;
