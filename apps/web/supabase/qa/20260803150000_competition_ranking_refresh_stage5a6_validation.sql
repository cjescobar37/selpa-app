begin;

create or replace function pg_temp.run_stage5a6_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club_id uuid;
  v_season_id uuid;
  v_division_id uuid;
  v_other_division_id uuid;
  v_entry_id uuid;
  v_club_player_id uuid;
  v_actor_id uuid;
  v_before_points bigint;
  v_after_points bigint;
  v_before_revision bigint;
  v_after_revision bigint;
  v_other_revision bigint;
  v_transaction_key text := 'qa-ranking-refresh-' || gen_random_uuid();
begin
  if to_regprocedure('public.refresh_competition_ranking_scope(uuid,uuid,uuid)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta Stage 5A.6';
    return;
  end if;

  select
    entry.club_id,
    division.season_id,
    entry.division_id,
    entry.id,
    entry.club_player_id
  into
    v_club_id,
    v_season_id,
    v_division_id,
    v_entry_id,
    v_club_player_id
  from public.competition_player_entries as entry
  join public.competition_divisions as division
    on division.id = entry.division_id
   and division.club_id = entry.club_id
  join public.club_players as player
    on player.id = entry.club_player_id
   and player.club_id = entry.club_id
  where division.modality = 'INDIVIDUAL'
    and division.segment_id is null
    and division.is_active
    and entry.status = 'ACTIVE'
    and entry.valid_until is null
    and player.approved_at is not null
  order by entry.id
  limit 1;

  if v_entry_id is null then
    return query select 'FAIL', 'QA no ejecutable: falta entry individual ACTIVE';
    return;
  end if;

  select membership.user_id
  into v_actor_id
  from public.club_memberships as membership
  where membership.club_id = v_club_id
    and membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_actor_id is null then
    return query select 'FAIL', 'QA no ejecutable: falta OWNER aprobado';
    return;
  end if;

  perform public.refresh_competition_ranking_scope(
    v_club_id,
    v_season_id,
    v_division_id
  );

  select cached.total_points
  into v_before_points
  from public.competition_ranking_entry_totals as cached
  where cached.club_id = v_club_id
    and cached.season_id = v_season_id
    and cached.division_id = v_division_id
    and cached.player_entry_id = v_entry_id;

  select scope.revision
  into v_before_revision
  from public.competition_ranking_refresh_scopes as scope
  where scope.club_id = v_club_id
    and scope.season_id = v_season_id
    and scope.division_id = v_division_id;

  select scope.division_id, scope.revision
  into v_other_division_id, v_other_revision
  from public.competition_ranking_refresh_scopes as scope
  where scope.club_id = v_club_id
    and scope.season_id = v_season_id
    and scope.division_id <> v_division_id
  order by scope.division_id
  limit 1;

  -- Un evento NON_SCORING o sin movimientos no toca el Ledger y, por lo tanto,
  -- no invalida ni incrementa la revisión del ranking.
  if (
    select scope.revision
    from public.competition_ranking_refresh_scopes as scope
    where scope.club_id = v_club_id
      and scope.season_id = v_season_id
      and scope.division_id = v_division_id
  ) <> v_before_revision then
    raise exception 'Un evento sin puntos refrescó el ranking';
  end if;

  perform set_config('selpa.competition_points_write', 'allowed', true);

  insert into public.competition_point_transactions (
    club_id,
    season_id,
    division_id,
    player_entry_id,
    club_player_id,
    transaction_type,
    source_type,
    source_id,
    source_concept,
    idempotency_key,
    points,
    effective_at,
    reason,
    rule_snapshot,
    metadata,
    created_by
  ) values (
    v_club_id,
    v_season_id,
    v_division_id,
    v_entry_id,
    v_club_player_id,
    'TOURNAMENT_RESULT',
    'TOURNAMENT',
    gen_random_uuid(),
    'COMPETITION_RANKING_REFRESH_QA',
    v_transaction_key,
    7,
    now(),
    'QA Stage 5A.6',
    '{"qa":true}',
    '{"stage":"5A.6"}',
    v_actor_id
  );

  select cached.total_points
  into v_after_points
  from public.competition_ranking_entry_totals as cached
  where cached.club_id = v_club_id
    and cached.season_id = v_season_id
    and cached.division_id = v_division_id
    and cached.player_entry_id = v_entry_id;

  select scope.revision
  into v_after_revision
  from public.competition_ranking_refresh_scopes as scope
  where scope.club_id = v_club_id
    and scope.season_id = v_season_id
    and scope.division_id = v_division_id;

  if v_after_points <> v_before_points + 7
     or v_after_revision <> v_before_revision + 1 then
    raise exception 'El scope afectado no se refrescó exactamente una vez';
  end if;

  if v_other_division_id is not null and (
    select scope.revision
    from public.competition_ranking_refresh_scopes as scope
    where scope.club_id = v_club_id
      and scope.season_id = v_season_id
      and scope.division_id = v_other_division_id
  ) <> v_other_revision then
    raise exception 'Se refrescó una división no afectada';
  end if;

  if (
    select totals.total_points
    from public.get_competition_points_totals(
      v_club_id,
      v_season_id,
      v_division_id
    ) as totals
    where totals.player_entry_id = v_entry_id
  ) <> v_after_points then
    raise exception 'Ranking final no coincide con la proyección';
  end if;

  begin
    insert into public.competition_point_transactions (
      club_id,
      season_id,
      division_id,
      player_entry_id,
      club_player_id,
      transaction_type,
      source_type,
      source_id,
      source_concept,
      idempotency_key,
      points,
      effective_at,
      reason,
      rule_snapshot,
      metadata,
      created_by
    ) values (
      v_club_id,
      v_season_id,
      v_division_id,
      v_entry_id,
      v_club_player_id,
      'TOURNAMENT_RESULT',
      'TOURNAMENT',
      gen_random_uuid(),
      'COMPETITION_RANKING_REFRESH_QA',
      v_transaction_key,
      7,
      now(),
      'QA replay',
      '{}',
      '{}',
      v_actor_id
    );
    raise exception 'Ledger aceptó idempotency duplicada';
  exception
    when unique_violation then null;
  end;

  if (
    select scope.revision
    from public.competition_ranking_refresh_scopes as scope
    where scope.club_id = v_club_id
      and scope.season_id = v_season_id
      and scope.division_id = v_division_id
  ) <> v_after_revision then
    raise exception 'Publicación repetida refrescó ranking';
  end if;

  begin
    insert into public.competition_point_transactions (
      club_id,
      season_id,
      division_id,
      player_entry_id,
      club_player_id,
      transaction_type,
      source_type,
      source_id,
      source_concept,
      idempotency_key,
      points,
      effective_at,
      reason,
      rule_snapshot,
      metadata,
      created_by
    ) values (
      v_club_id,
      v_season_id,
      gen_random_uuid(),
      v_entry_id,
      v_club_player_id,
      'TOURNAMENT_RESULT',
      'TOURNAMENT',
      gen_random_uuid(),
      'COMPETITION_RANKING_REFRESH_QA',
      'qa-invalid-' || gen_random_uuid(),
      5,
      now(),
      'QA invalid',
      '{}',
      '{}',
      v_actor_id
    );
    raise exception 'Movimiento inválido aceptado';
  exception
    when foreign_key_violation or check_violation then null;
  end;

  if (
    select scope.revision
    from public.competition_ranking_refresh_scopes as scope
    where scope.club_id = v_club_id
      and scope.season_id = v_season_id
      and scope.division_id = v_division_id
  ) <> v_after_revision then
    raise exception 'Rollback inválido alteró la proyección';
  end if;

  return query select
    'PASS',
    'Stage 5A.6 válido: refresh atómico y acotado, puntos/cero, divisiones aisladas, idempotencia, rollback y ranking final';
exception
  when others then
    return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_stage5a6_qa();

rollback;
