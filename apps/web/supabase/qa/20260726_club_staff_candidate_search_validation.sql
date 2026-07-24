-- QA transaccional — búsqueda y promoción de jugadores a staff.
-- Ejecutar después de 20260726_club_staff_candidate_search.sql.

begin;

create or replace function pg_temp.expect_staff_candidate_error(p_sql text,p_code text)
returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm like '%SELPA_CODE:'||p_code||'%' then return; end if;
    raise exception 'Código esperado %, resultado: %',p_code,sqlerrm;
  end;
  raise exception 'La operación no produjo el error esperado: %',p_code;
end;
$$;

create or replace function pg_temp.run_staff_candidate_qa()
returns table(qa_status text,qa_detail text)
language plpgsql
as $qa$
declare
  v_users uuid[]; v_emails text[]; v_names text[]; v_club uuid;
  v_owner uuid; v_admin uuid; v_operator uuid; v_plan uuid; v_player uuid; v_pending uuid;
  v_player_membership uuid; v_before_player jsonb; v_after_player jsonb;
  v_result jsonb; v_role text; v_count integer;
begin
  select array_agg(candidate.id order by candidate.created_at),
         array_agg(lower(candidate.email) order by candidate.created_at),
         array_agg(candidate.search_name order by candidate.created_at)
    into v_users,v_emails,v_names
  from (
    select users.id,users.email,users.created_at,
      coalesce(
        nullif(btrim(profile.display_name),''),
        nullif(btrim(profile.first_name),''),
        nullif(btrim(profile.last_name),'')
      ) as search_name
    from auth.users users
    inner join public.profiles profile on profile.user_id=users.id
    where users.email is not null
      and coalesce(
        nullif(btrim(profile.display_name),''),
        nullif(btrim(profile.first_name),''),
        nullif(btrim(profile.last_name),'')
      ) is not null
      and char_length(coalesce(
        nullif(btrim(profile.display_name),''),
        nullif(btrim(profile.first_name),''),
        nullif(btrim(profile.last_name),'')
      )) >= 2
    order by users.created_at
    limit 6
  ) candidate;
  if coalesce(cardinality(v_users),0)<6 then
    return query select 'FAIL','QA no ejecutable: se requieren seis usuarios reales con email y perfil válido'; return;
  end if;
  v_owner:=v_users[1];v_admin:=v_users[2];v_operator:=v_users[3];
  v_plan:=v_users[4];v_player:=v_users[5];v_pending:=v_users[6];

  insert into public.clubs as club(name,slug)
  values('QA Staff Candidates','qa-staff-candidates-'||txid_current()) returning club.id into v_club;
  insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
  values (v_club,v_owner,'OWNER','APPROVED',now(),v_owner),
    (v_club,v_admin,'ADMIN','APPROVED',now(),v_owner),
    (v_club,v_operator,'OPERADOR','APPROVED',now(),v_owner),
    (v_club,v_plan,'PLANILLERO','APPROVED',now(),v_owner),
    (v_club,v_player,'PLAYER','APPROVED',now(),v_owner),
    (v_club,v_pending,'PLAYER','APPROVED',now(),v_owner);
  select membership.id into v_player_membership from public.club_memberships membership
  where membership.club_id=v_club and membership.user_id=v_player;

  insert into public.club_players(club_id,user_id,display_name,category,approved_at,approved_by)
  values(v_club,v_player,'QA Searchable Player',6,now(),v_owner),
        (v_club,v_pending,'QA Pending Player',6,now(),v_owner);
  select to_jsonb(player) into v_before_player from public.club_players player
  where player.club_id=v_club and player.user_id=v_player;
  insert into public.club_user_invites(club_id,email,role,status,invited_by,target_user_id)
  values(v_club,v_emails[6],'PLANILLERO','PENDING',v_owner,v_pending);

  -- 1-8: nombre/email encuentran PLAYER y excluyen todos los roles de staff y pending.
  select count(*) into v_count from public.search_club_staff_candidates(v_club,v_names[5],v_owner,10) candidate
  where candidate.user_id=v_player;
  if v_count<>1 then raise exception 'Búsqueda por nombre no encontró PLAYER válido'; end if;
  select count(*) into v_count from public.search_club_staff_candidates(v_club,v_emails[5],v_owner,10) candidate
  where candidate.user_id=v_player;
  if v_count<>1 then raise exception 'Búsqueda por email no encontró PLAYER válido'; end if;
  if exists(
    select 1
    from unnest(array[
      v_emails[1],v_emails[2],v_emails[3],v_emails[4],v_emails[6]
    ]) searched(email)
    cross join lateral public.search_club_staff_candidates(
      v_club,searched.email,v_owner,20
    ) candidate
    where candidate.user_id in(v_owner,v_admin,v_operator,v_plan,v_pending)
  ) then
    raise exception 'Búsqueda incluyó staff actual o invitación pendiente';
  end if;

  -- 16: PLAYER no puede buscar ni promover.
  perform pg_temp.expect_staff_candidate_error(format(
    'select * from public.search_club_staff_candidates(%L,%L,%L,%s)',v_club,'QA',v_player,10),'forbidden');
  perform pg_temp.expect_staff_candidate_error(format(
    'select public.promote_club_player_to_staff_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_pending,'ADMIN',v_player),'forbidden');

  -- 9-14: PLAYER se promociona a los tres roles reutilizando membership y ficha.
  foreach v_role in array array['PLANILLERO','OPERADOR','ADMIN'] loop
    update public.club_memberships as membership set role='PLAYER' where membership.id=v_player_membership;
    v_result:=public.promote_club_player_to_staff_atomic(
      v_club,v_player,v_role::public.club_role,v_owner
    );
    if v_result->>'membership_id' is distinct from v_player_membership::text
       or v_result->>'role' is distinct from v_role then
      raise exception 'Promoción PLAYER -> % no reutilizó membership',v_role;
    end if;
    if (select count(*) from public.club_memberships membership
        where membership.club_id=v_club and membership.user_id=v_player)<>1 then
      raise exception 'Promoción PLAYER -> % duplicó membership',v_role;
    end if;
  end loop;
  select to_jsonb(player) into v_after_player from public.club_players player
  where player.club_id=v_club and player.user_id=v_player;
  if v_after_player is distinct from v_before_player then raise exception 'Promoción modificó club_players'; end if;

  -- 15: el modo externo conserva la invitación pendiente por email.
  v_result:=public.create_club_team_invite_atomic(
    v_club,'qa-external-'||txid_current()||'@example.test','PLANILLERO',v_owner
  );
  if v_result->>'operation' is distinct from 'INVITED' or v_result->>'status' is distinct from 'PENDING' then
    raise exception 'Invitación externa por email dejó de funcionar';
  end if;

  return query select 'PASS','Búsqueda segura y promoción de jugadores a staff válidas';
exception when others then return query select 'FAIL',sqlerrm;
end;
$qa$;

select qa.qa_status||' | '||qa.qa_detail as result from pg_temp.run_staff_candidate_qa() qa;
rollback;
