begin;

create or replace function pg_temp.run_competition_points_stage4_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club uuid;
  v_season uuid;
  v_entry uuid;
  v_zero_entry uuid;
  v_inactive_entry uuid;
  v_actor uuid;
  v_original_points integer;
  v_first jsonb;
  v_second jsonb;
  v_reversal jsonb;
  v_count integer;
  v_total bigint;
  v_failed boolean;
begin
  if to_regclass('public.competition_point_transactions') is null then
    return query select 'FAIL', 'QA no ejecutable: aplicar primero las dos migraciones Stage 4'; return;
  end if;

  select entry.club_id, division.season_id, entry.id, player.ranking_points
  into v_club, v_season, v_entry, v_original_points
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join public.competition_seasons season on season.id=division.season_id and season.club_id=division.club_id
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
  where season.status='ACTIVE' and division.is_active and division.modality='INDIVIDUAL' and division.segment_id is null
    and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null
    and coalesce(player.ranking_points,0) <> 0
  order by entry.id limit 1;
  if v_entry is null then return query select 'FAIL', 'QA no ejecutable: falta una entrada ACTIVE con puntos'; return; end if;

  select membership.user_id into v_actor from public.club_memberships membership
  where membership.club_id=v_club and membership.role='OWNER' and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_actor is null then return query select 'FAIL', 'QA no ejecutable: falta OWNER aprobado'; return; end if;

  v_first := public.create_competition_opening_balance(v_entry);
  v_second := public.create_competition_opening_balance(v_entry);
  if v_first->>'status' <> 'CREATED' or v_second->>'status' <> 'EXISTS' then
    raise exception 'OPENING_BALANCE no fue idempotente: % / %', v_first, v_second;
  end if;
  select count(*) into v_count from public.competition_point_transactions transaction
  where transaction.player_entry_id=v_entry and transaction.transaction_type='OPENING_BALANCE';
  if v_count <> 1 then raise exception 'Se duplicó OPENING_BALANCE'; end if;

  select entry.id into v_zero_entry
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
  where entry.club_id=v_club and division.season_id=v_season and entry.id<>v_entry
    and division.is_active and division.modality='INDIVIDUAL' and division.segment_id is null
    and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null
  order by entry.id limit 1;
  if v_zero_entry is not null then
    update public.club_players player set ranking_points=0
    from public.competition_player_entries entry where entry.id=v_zero_entry and player.id=entry.club_player_id;
    if public.create_competition_opening_balance(v_zero_entry)->>'status' <> 'SKIPPED_ZERO' then
      raise exception 'Un saldo cero creó una transacción';
    end if;
  end if;

  select entry.id into v_inactive_entry
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
  where entry.club_id=v_club and division.season_id=v_season and entry.id not in (v_entry,coalesce(v_zero_entry,v_entry))
    and division.is_active and division.modality='INDIVIDUAL' and division.segment_id is null
    and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null
    and not exists (select 1 from public.competition_point_transactions point_tx where point_tx.player_entry_id=entry.id and point_tx.transaction_type='OPENING_BALANCE')
  order by entry.id limit 1;
  if v_inactive_entry is not null then
    update public.competition_player_entries entry set status='SUSPENDED' where entry.id=v_inactive_entry;
    v_failed := false;
    begin
      perform public.create_competition_opening_balance(v_inactive_entry);
    exception when check_violation then v_failed := true;
    end;
    if not v_failed then raise exception 'Una entry inactiva recibió OPENING_BALANCE'; end if;
  end if;

  -- La API de creación no acepta club, temporada, división ni puntos arbitrarios.
  -- La defensa de base se comprueba intentando cruzar relaciones con un INSERT administrativo.
  v_failed := false;
  begin
    perform set_config('selpa.competition_points_write','allowed',true);
    insert into public.competition_point_transactions(
      club_id,season_id,division_id,player_entry_id,club_player_id,
      transaction_type,source_type,source_concept,idempotency_key,points,effective_at,reason,rule_snapshot,metadata
    )
    select gen_random_uuid(),division.season_id,entry.division_id,entry.id,entry.club_player_id,
      'SYSTEM_CORRECTION','SYSTEM','QA_INVALID_CLUB','qa-invalid-club:'||entry.id,1,now(),'QA','{}','{}'
    from public.competition_player_entries entry join public.competition_divisions division on division.id=entry.division_id
    where entry.id=v_entry;
  exception when foreign_key_violation or check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Se permitió acreditar para otro club'; end if;

  v_failed := false;
  begin
    insert into public.competition_point_transactions(
      club_id,season_id,division_id,player_entry_id,club_player_id,
      transaction_type,source_type,source_concept,idempotency_key,points,effective_at,reason,rule_snapshot,metadata
    )
    select entry.club_id,gen_random_uuid(),entry.division_id,entry.id,entry.club_player_id,
      'SYSTEM_CORRECTION','SYSTEM','QA_INVALID_SEASON','qa-invalid-season:'||entry.id,1,now(),'QA','{}','{}'
    from public.competition_player_entries entry where entry.id=v_entry;
  exception when foreign_key_violation or check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Se permitió acreditar para otra temporada'; end if;

  v_failed := false;
  begin
    insert into public.competition_point_transactions(
      club_id,season_id,division_id,player_entry_id,club_player_id,
      transaction_type,source_type,source_concept,idempotency_key,points,effective_at,reason,rule_snapshot,metadata
    )
    select entry.club_id,division.season_id,
      coalesce((select other.id from public.competition_divisions other where other.club_id=entry.club_id and other.id<>entry.division_id order by other.id limit 1),gen_random_uuid()),
      entry.id,entry.club_player_id,'SYSTEM_CORRECTION','SYSTEM','QA_INVALID_DIVISION',
      'qa-invalid-division:'||entry.id,1,now(),'QA','{}','{}'
    from public.competition_player_entries entry join public.competition_divisions division on division.id=entry.division_id
    where entry.id=v_entry;
  exception when foreign_key_violation or check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'Se permitió acreditar para otra división'; end if;

  v_reversal := public.reverse_competition_point_transaction((v_first->>'transaction_id')::uuid, 'QA rollback', v_actor);
  if v_reversal->>'status' <> 'CREATED' then raise exception 'No se creó la reversión'; end if;
  if public.reverse_competition_point_transaction((v_first->>'transaction_id')::uuid, 'QA repeat', v_actor)->>'status' <> 'EXISTS' then
    raise exception 'La reversión repetida no fue idempotente';
  end if;
  select total_points into v_total from public.get_competition_points_totals(v_club,v_season,null)
  where player_entry_id=v_entry;
  if coalesce(v_total,0) <> 0 then raise exception 'La reversión no compensó el saldo'; end if;

  begin
    perform public.reverse_competition_point_transaction((v_reversal->>'transaction_id')::uuid, 'No permitido', v_actor);
    raise exception 'Se permitió revertir una reversión';
  exception when check_violation then null;
  end;

  return query select 'PASS', 'Stage 4 válido: opening balance, cero, idempotencia, agregación, inmutabilidad y reversión';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result from pg_temp.run_competition_points_stage4_qa();

rollback;
