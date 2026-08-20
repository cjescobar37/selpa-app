begin;

create or replace function pg_temp.run_tournament_independent_create_idempotency_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_owner uuid;
  v_club uuid;
  v_other_owner uuid;
  v_other_club uuid;
  v_player uuid;
  v_payload jsonb;
  v_first public.tournaments%rowtype;
  v_replay public.tournaments%rowtype;
  v_other public.tournaments%rowtype;
  v_failed boolean;
  v_key text := 'qa-independent-create-idempotency-0001';
  v_failed_key text := 'qa-independent-create-rollback-0001';
begin
  if to_regclass('public.tournament_create_commands') is null
     or to_regprocedure('public.create_tournament_canonical(uuid,jsonb,text)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta la primitive idempotente de alta de torneo.';
    return;
  end if;

  select membership.user_id, membership.club_id
  into v_owner, v_club
  from public.club_memberships membership
  where membership.role in ('OWNER', 'ADMIN')
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at, membership.user_id
  limit 1;

  select membership.user_id, membership.club_id
  into v_other_owner, v_other_club
  from public.club_memberships membership
  where membership.club_id is distinct from v_club
    and membership.role in ('OWNER', 'ADMIN')
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at, membership.user_id
  limit 1;

  select membership.user_id into v_player
  from public.club_memberships membership
  where membership.club_id = v_club
    and membership.role = 'PLAYER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at, membership.user_id
  limit 1;

  if v_owner is null or v_other_owner is null or v_player is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren dos administradores de clubes distintos y un PLAYER aprobado.';
    return;
  end if;

  v_payload := jsonb_build_object(
    'name', 'QA idempotencia torneo independiente',
    'type', 'OPEN',
    'gender', 'MALE',
    'segment', 'LIBRES',
    'category_rule', 'FIXED_CATEGORY',
    'category_id', 6,
    'start_date', (current_date + 10)::text,
    'end_date', (current_date + 11)::text,
    'registration_deadline', (now() + interval '2 days')::text,
    'price_per_player', 0,
    'min_pairs', 2,
    'max_pairs', 8
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select * into v_first from public.create_tournament_canonical(v_club, v_payload, v_key);
  select * into v_replay from public.create_tournament_canonical(v_club, v_payload, v_key);
  reset role;

  if v_first.id is null or v_replay.id is distinct from v_first.id then
    raise exception 'Replay no devolvió el mismo tournament_id';
  end if;
  if (select count(*) from public.tournaments where id = v_first.id) <> 1
     or (select count(*) from public.tournament_create_commands where club_id = v_club and actor_id = v_owner and idempotency_key = v_key and tournament_id = v_first.id and completed_at is not null) <> 1 then
    raise exception 'Alta/replay dejó un estado de comandos inválido';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.create_tournament_canonical(v_club, v_payload || jsonb_build_object('name', 'Payload distinto'), v_key);
  exception when unique_violation then
    if sqlerrm = 'IDEMPOTENCY_CONFLICT' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed then raise exception 'Misma key con payload distinto no fue rechazada'; end if;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  select * into v_other from public.create_tournament_canonical(v_other_club, v_payload || jsonb_build_object('name', 'QA actor y club distintos'), v_key);
  reset role;
  if v_other.id is null or v_other.id = v_first.id then raise exception 'Actor/club distinto reutilizó un torneo ajeno'; end if;

  perform set_config('request.jwt.claim.sub', v_other_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.create_tournament_canonical(v_club, v_payload, 'qa-independent-cross-club-0001');
  exception when insufficient_privilege then
    if sqlerrm = 'TOURNAMENT_FORBIDDEN' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed then raise exception 'Administrador cross-club pudo crear torneo'; end if;

  perform set_config('request.jwt.claim.sub', v_player::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.create_tournament_canonical(v_club, v_payload, 'qa-independent-player-0001');
  exception when insufficient_privilege then
    if sqlerrm = 'TOURNAMENT_FORBIDDEN' then v_failed := true; else raise; end if;
  end;
  reset role;
  if not v_failed then raise exception 'PLAYER pudo crear torneo'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_failed := false;
  begin
    perform public.create_tournament_canonical(v_club, v_payload || jsonb_build_object('name', ''), v_failed_key);
  exception when invalid_parameter_value then v_failed := true;
  end;
  reset role;
  if not v_failed then raise exception 'Payload inválido no falló'; end if;
  if exists(select 1 from public.tournament_create_commands command where command.club_id = v_club and command.actor_id = v_owner and command.idempotency_key = v_failed_key)
     or exists(select 1 from public.tournaments tournament where tournament.club_id = v_club and tournament.name = '') then
    raise exception 'Fallo dejó comando o torneo parcial';
  end if;

  return query select 'PASS', 'Alta independiente idempotente: create, replay, conflicto, actor/club, permisos y rollback.';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_tournament_independent_create_idempotency_qa();

rollback;
