begin;

create or replace function pg_temp.run_competition_player_entries_stage2_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_owner uuid;
  v_admin uuid;
  v_player_a uuid;
  v_player_b uuid;
  v_season_a uuid;
  v_season_closed uuid;
  v_season_b uuid;
  v_branch_a uuid;
  v_branch_alt uuid;
  v_branch_b uuid;
  v_segment_a uuid;
  v_segment_alt uuid;
  v_category_a uuid;
  v_category_alt uuid;
  v_category_third uuid;
  v_division_a uuid;
  v_division_alt_category uuid;
  v_division_segment_a uuid;
  v_division_segment_alt uuid;
  v_division_branch_alt uuid;
  v_division_admin uuid;
  v_division_pairs uuid;
  v_division_closed uuid;
  v_division_inactive uuid;
  v_division_b uuid;
  v_entry_a public.competition_player_entries;
  v_entry_same public.competition_player_entries;
  v_entry_transferred public.competition_player_entries;
  v_entry_segment_a public.competition_player_entries;
  v_entry_segment_alt public.competition_player_entries;
  v_entry_branch_alt public.competition_player_entries;
  v_entry_admin public.competition_player_entries;
  v_before_category integer;
  v_before_gender text;
  v_before_points numeric;
  v_count bigint;
  v_failed boolean;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  if to_regclass('public.competition_player_entries') is null
     or to_regprocedure('public.assign_player_to_competition_division(uuid,uuid,uuid,text,text,timestamp with time zone)') is null
     or to_regprocedure('public.set_competition_player_entry_status(uuid,text,text,timestamp with time zone)') is null then
    return query select 'FAIL', 'QA no ejecutable: primero aplicá 20260801_competition_player_entries_stage2.sql';
    return;
  end if;

  select membership.club_id, membership.user_id
  into v_club_a, v_owner
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
    and exists (
      select 1 from public.club_players player where player.club_id = membership.club_id
    )
  order by membership.created_at
  limit 1;

  select player.id into v_player_a
  from public.club_players player
  where player.club_id = v_club_a
  order by player.created_at
  limit 1;

  select club.id, player.id
  into v_club_b, v_player_b
  from public.clubs club
  join public.club_players player on player.club_id = club.id
  where club.id <> v_club_a
  order by club.created_at, player.created_at
  limit 1;

  select auth_user.id into v_admin
  from auth.users auth_user
  where auth_user.id <> v_owner
    and not exists (
      select 1 from public.club_memberships membership
      where membership.club_id = v_club_a and membership.user_id = auth_user.id
    )
    and not exists (
      select 1 from public.platform_admins platform_admin
      where platform_admin.user_id = auth_user.id
    )
  order by auth_user.created_at
  limit 1;

  if v_club_a is null or v_owner is null or v_player_a is null
     or v_club_b is null or v_player_b is null or v_admin is null then
    return query select 'FAIL', 'QA no ejecutable: se requieren OWNER, dos clubes con jugadores y un usuario adicional';
    return;
  end if;

  select
    player.category,
    player.gender,
    case
      when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (to_jsonb(player)->>'ranking_points')::numeric
      else null
    end
  into v_before_category, v_before_gender, v_before_points
  from public.club_players player
  where player.id = v_player_a;

  insert into public.competition_seasons (
    club_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_club_a, 'QA Stage2 ' || v_suffix, current_date, current_date + 90, 'DRAFT', v_owner
  ) returning id into v_season_a;

  insert into public.competition_seasons (
    club_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_club_a, 'QA Stage2 closed ' || v_suffix, current_date - 90, current_date - 1, 'CLOSED', v_owner
  ) returning id into v_season_closed;

  insert into public.competition_seasons (
    club_id, name, starts_on, ends_on, status, created_by
  ) values (
    v_club_b, 'QA Stage2 B ' || v_suffix, current_date, current_date + 90, 'DRAFT', v_owner
  ) returning id into v_season_b;

  insert into public.competition_branches (club_id, name, slug)
  values (v_club_a, 'QA rama', 'qa-rama-' || v_suffix)
  returning id into v_branch_a;

  insert into public.competition_branches (club_id, name, slug)
  values (v_club_a, 'QA rama alternativa', 'qa-rama-alt-' || v_suffix)
  returning id into v_branch_alt;

  insert into public.competition_branches (club_id, name, slug)
  values (v_club_b, 'QA rama B', 'qa-rama-b-' || v_suffix)
  returning id into v_branch_b;

  insert into public.competition_segments (club_id, name, slug)
  values (v_club_a, 'QA segmento', 'qa-segmento-' || v_suffix)
  returning id into v_segment_a;

  insert into public.competition_segments (club_id, name, slug)
  values (v_club_a, 'QA segmento alternativo', 'qa-segmento-alt-' || v_suffix)
  returning id into v_segment_alt;

  insert into public.competition_categories (club_id, name, short_label, slug)
  values (v_club_a, 'QA categoría A', 'A', 'qa-cat-a-' || v_suffix)
  returning id into v_category_a;

  insert into public.competition_categories (club_id, name, short_label, slug)
  values (v_club_a, 'QA categoría B', 'B', 'qa-cat-b-' || v_suffix)
  returning id into v_category_alt;

  insert into public.competition_categories (club_id, name, short_label, slug)
  values (v_club_a, 'QA categoría C', 'C', 'qa-cat-c-' || v_suffix)
  returning id into v_category_third;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, v_category_a)
  returning id into v_division_a;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, v_category_alt)
  returning id into v_division_alt_category;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, segment_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, v_segment_a, v_category_a)
  returning id into v_division_segment_a;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, segment_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, v_segment_alt, v_category_a)
  returning id into v_division_segment_alt;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_alt, v_category_a)
  returning id into v_division_branch_alt;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_a, 'INDIVIDUAL', v_branch_alt, v_category_third)
  returning id into v_division_admin;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_a, 'PAIRS', v_branch_a, v_category_a)
  returning id into v_division_pairs;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_a, v_season_closed, 'INDIVIDUAL', v_branch_a, v_category_a)
  returning id into v_division_closed;

  insert into public.competition_divisions (
    club_id, season_id, modality, branch_id, category_id, is_active
  ) values (
    v_club_a, v_season_a, 'INDIVIDUAL', v_branch_a, v_category_third, false
  ) returning id into v_division_inactive;

  insert into public.competition_categories (club_id, name, short_label, slug)
  values (v_club_b, 'QA categoría B', 'B', 'qa-cat-b2-' || v_suffix)
  returning id into v_category_third;

  insert into public.competition_divisions (club_id, season_id, modality, branch_id, category_id)
  values (v_club_b, v_season_b, 'INDIVIDUAL', v_branch_b, v_category_third)
  returning id into v_division_b;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  select count(*) into v_count from public.competition_player_entries entry where entry.club_id = v_club_a;
  if v_count <> 0 then raise exception 'RLS expuso entradas a un usuario sin permisos'; end if;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_a, v_division_a);
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then raise exception 'RPC permitió asignar sin ranking:manage'; end if;
  reset role;

  insert into public.club_memberships (
    club_id, user_id, role, status, approved_by, approved_at
  ) values (
    v_club_a, v_admin, 'ADMIN', 'APPROVED', v_owner, now()
  );

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_b, v_division_a);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se asignó un jugador de otro club'; end if;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_a, v_division_b);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se asignó una división de otro club'; end if;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_a, v_division_pairs);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se asignó un jugador a una división PAIRS'; end if;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_a, v_division_closed);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se asignó un jugador a una temporada CLOSED'; end if;

  v_failed := false;
  begin
    perform public.assign_player_to_competition_division(v_club_a, v_player_a, v_division_inactive);
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se asignó un jugador a una división inactiva'; end if;

  v_entry_a := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_a, 'MANUAL', 'QA inicial', now()
  );
  if v_entry_a.status <> 'ACTIVE' then raise exception 'no se creó una entrada ACTIVE válida'; end if;

  v_entry_same := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_a, 'MANUAL', 'QA repetida', now()
  );
  if v_entry_same.id <> v_entry_a.id then raise exception 'la asignación equivalente no fue idempotente'; end if;

  v_entry_segment_a := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_segment_a, 'MANUAL', null, now()
  );
  v_entry_segment_alt := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_segment_alt, 'MANUAL', null, now()
  );
  if v_entry_segment_a.id = v_entry_segment_alt.id then raise exception 'no se permitieron dos segmentos distintos'; end if;

  v_entry_branch_alt := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_branch_alt, 'MANUAL', null, now()
  );

  reset role;
  v_failed := false;
  begin
    insert into public.competition_player_entries (
      club_id, division_id, club_player_id, status, assigned_by
    ) values (
      v_club_a, v_division_alt_category, v_player_a, 'ACTIVE', v_owner
    );
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'se permitieron dos categorías vigentes en el mismo recorrido'; end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  set local role authenticated;
  v_entry_transferred := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_alt_category, 'PROMOTION', 'QA cambio de categoría', now()
  );

  if v_entry_transferred.previous_entry_id <> v_entry_a.id then
    raise exception 'previous_entry_id no enlazó la entrada anterior';
  end if;
  if not exists (
    select 1 from public.competition_player_entries entry
    where entry.id = v_entry_a.id and entry.status = 'TRANSFERRED' and entry.valid_until is not null
  ) then
    raise exception 'el cambio de categoría no cerró la entrada anterior';
  end if;
  if (select count(*) from public.competition_player_entries entry where entry.id in (v_entry_a.id, v_entry_transferred.id)) <> 2 then
    raise exception 'el historial anterior no fue preservado';
  end if;

  v_entry_transferred := public.set_competition_player_entry_status(
    v_entry_transferred.id, 'SUSPENDED', 'QA suspensión', now()
  );
  if v_entry_transferred.status <> 'SUSPENDED' or v_entry_transferred.valid_until is not null then
    raise exception 'la suspensión alteró incorrectamente la vigencia';
  end if;
  if exists (
    select 1 from public.competition_player_entries entry
    where entry.id = v_entry_transferred.id and entry.status = 'ACTIVE'
  ) then
    raise exception 'una entrada suspendida se consideró ACTIVE para ranking';
  end if;

  v_entry_transferred := public.set_competition_player_entry_status(
    v_entry_transferred.id, 'ACTIVE', 'QA reactivación', now()
  );
  if v_entry_transferred.status <> 'ACTIVE' then raise exception 'no se reactivó la entrada suspendida'; end if;

  v_entry_transferred := public.set_competition_player_entry_status(
    v_entry_transferred.id, 'WITHDRAWN', 'QA retiro', now()
  );
  if v_entry_transferred.status <> 'WITHDRAWN' or v_entry_transferred.valid_until is null then
    raise exception 'no se retiró correctamente la entrada';
  end if;

  v_failed := false;
  begin
    perform public.set_competition_player_entry_status(v_entry_transferred.id, 'ACTIVE', null, now());
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'se reactivó una entrada retirada'; end if;

  v_failed := false;
  begin
    delete from public.competition_player_entries entry where entry.id = v_entry_segment_a.id;
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'un usuario autenticado pudo borrar historial físicamente'; end if;
  reset role;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  set local role authenticated;
  v_entry_admin := public.assign_player_to_competition_division(
    v_club_a, v_player_a, v_division_admin, 'MANUAL', 'QA ADMIN', now()
  );
  if v_entry_admin.status <> 'ACTIVE' then raise exception 'ADMIN no pudo usar la RPC autorizada'; end if;
  reset role;

  select count(*) into v_count
  from public.competition_player_entries entry
  join public.competition_divisions division
    on division.id = entry.division_id and division.club_id = entry.club_id
  where entry.club_id = v_club_a
    and entry.club_player_id = v_player_a
    and entry.valid_until is null
    and entry.status in ('ACTIVE', 'SUSPENDED')
    and division.season_id = v_season_a
    and division.branch_id = v_branch_a
    and division.segment_id is null;
  if v_count > 1 then raise exception 'quedaron entradas vigentes duplicadas en un recorrido'; end if;

  if (select player.category from public.club_players player where player.id = v_player_a) is distinct from v_before_category then
    raise exception 'club_players.category cambió';
  end if;
  if (select player.gender from public.club_players player where player.id = v_player_a) is distinct from v_before_gender then
    raise exception 'club_players.gender cambió';
  end if;
  if (
    select case
      when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (to_jsonb(player)->>'ranking_points')::numeric
      else null
    end
    from public.club_players player where player.id = v_player_a
  ) is distinct from v_before_points then
    raise exception 'club_players.ranking_points cambió';
  end if;

  if to_regclass('public.club_players') is null
     or to_regclass('public.player_active_partnerships') is null
     or to_regclass('public.tournaments') is null then
    raise exception 'la compatibilidad estructural del ranking actual fue alterada';
  end if;

  return query select 'PASS', 'Etapa 2 válida: asignación individual, recorridos, historial, estados, RLS y compatibilidad legacy';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa.qa_status || ' | ' || qa.qa_detail as result
from pg_temp.run_competition_player_entries_stage2_qa() qa;

rollback;
