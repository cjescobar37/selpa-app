-- QA transaccional — CLUB Equipo y Roles, Etapa 1.
-- Ejecutar el archivo completo en Supabase SQL Editor después de aplicar
-- 20260723_club_roles_stage1.sql. Toda escritura de prueba termina en ROLLBACK.

begin isolation level repeatable read;

create or replace function pg_temp.run_club_roles_stage1_qa()
returns table(status text, detail text)
language plpgsql
as $qa$
declare
  v_club uuid;
  v_owner uuid;
  v_actor uuid;
  v_membership uuid;
  v_player uuid;
  v_existing_memberships_hash text;
  v_after_memberships_hash text;
  v_enum_roles text[];
  v_capability text;
  v_all_capabilities constant text[] := array[
    'dashboard:view','club:view','club:update','club:branding',
    'memberships:view','memberships:manage','roles:view','roles:manage','ownership:transfer',
    'players:view','players:manage','players:private_view','ranking:view','ranking:manage',
    'tournaments:view','tournaments:create','tournaments:update','tournaments:publish',
    'tournaments:cancel','tournaments:delete','registrations:view','registrations:manage',
    'groups:generate','matches:view','matches:update','matches:schedule','playoff:generate',
    'finance:view','finance:manage','payments:view','payments:manage',
    'content:view','news:manage','sponsors:manage','ads:manage',
    'messages:view','messages:reply','reports:operational_view','audit:view','security:manage'
  ];
  v_operator_capabilities constant text[] := array[
    'dashboard:view','club:view','memberships:view','memberships:manage',
    'players:view','players:manage','players:private_view','ranking:view','ranking:manage',
    'tournaments:view','tournaments:create','tournaments:update','tournaments:publish',
    'tournaments:cancel','registrations:view','registrations:manage','groups:generate',
    'matches:view','matches:update','matches:schedule','playoff:generate',
    'content:view','news:manage','sponsors:manage','ads:manage',
    'messages:view','messages:reply','reports:operational_view'
  ];
  v_scorekeeper_capabilities constant text[] := array[
    'dashboard:view','club:view','tournaments:view','matches:view','matches:update'
  ];
begin
  -- 1/2. El enum debe contener exactamente los cinco roles definitivos.
  select array_agg(enum_value.enumlabel order by enum_value.enumlabel)
    into v_enum_roles
  from pg_catalog.pg_enum enum_value
  where enum_value.enumtypid = 'public.club_role'::regtype;

  if v_enum_roles is distinct from array['ADMIN','OPERADOR','OWNER','PLANILLERO','PLAYER']::text[] then
    raise exception 'Enum club_role inesperado: %', coalesce(v_enum_roles::text, 'NULL');
  end if;
  if 'OPERATIVO' = any(v_enum_roles) then
    raise exception 'OPERATIVO todavía existe en public.club_role';
  end if;

  -- Club/OWNER real como ancla; todos los demás datos son temporales.
  select membership.club_id, membership.user_id
    into v_club, v_owner
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_club is null then
    return query select 'FAIL', 'QA no ejecutable: falta club con OWNER APPROVED';
    return;
  end if;

  select candidate.id into v_actor
  from auth.users candidate
  where candidate.id <> v_owner
    and not exists (
      select 1 from public.club_memberships membership
      where membership.club_id = v_club and membership.user_id = candidate.id
    )
    and not exists (
      select 1 from public.club_players player
      where player.club_id = v_club and player.user_id = candidate.id
    )
  order by candidate.created_at
  limit 1;

  if v_actor is null then
    return query select 'FAIL', 'QA no ejecutable: falta usuario disponible sin membership ni club_players en el club elegido';
    return;
  end if;

  -- 3. Snapshot inmutable de todas las memberships preexistentes.
  select md5(coalesce(string_agg(
    concat_ws('|', membership.id, membership.club_id, membership.user_id,
      membership.role::text, membership.status::text,
      coalesce(membership.approved_at::text, '<null>')),
    ',' order by membership.id
  ), '')) into v_existing_memberships_hash
  from public.club_memberships membership;

  if exists (
    select 1 from public.club_memberships membership
    group by membership.club_id, membership.user_id
    having count(*) > 1
  ) then
    raise exception 'Existen memberships duplicadas por club_id/user_id';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_index index_def
    join pg_catalog.pg_class relation on relation.oid = index_def.indrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'club_memberships'
      and index_def.indisunique
      and pg_catalog.pg_get_indexdef(index_def.indexrelid) ~ '\(club_id, user_id\)'
  ) then
    raise exception 'Falta unicidad estructural club_memberships(club_id,user_id)';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- 7. club_players huérfano no habilita condición deportiva.
  insert into public.club_players(
    club_id,user_id,display_name,category,gender,approved_at,approved_by
  ) values (
    v_club,v_actor,null,null,null,now(),v_owner
  ) returning id into v_player;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  if public.is_club_player(v_club, v_actor) or public.is_club_player(v_club) then
    raise exception 'club_players huérfano habilitó condición deportiva';
  end if;

  -- 4/5. Estados de membership y approved_at.
  insert into public.club_memberships(
    club_id,user_id,role,status,approved_at,approved_by
  ) values (
    v_club,v_actor,'PLAYER','PENDING',now(),v_owner
  ) returning id into v_membership;

  if public.is_club_member_approved(v_club) then
    raise exception 'PENDING fue considerada membership aprobada';
  end if;
  if public.is_club_player(v_club, v_actor) then
    raise exception 'PENDING obtuvo condición deportiva';
  end if;

  update public.club_memberships
  set status='REJECTED', approved_at=now(), approved_by=v_owner
  where id=v_membership;
  if public.is_club_member_approved(v_club) then
    raise exception 'REJECTED fue considerada membership aprobada';
  end if;
  if public.is_club_player(v_club, v_actor) then
    raise exception 'REJECTED obtuvo condición deportiva';
  end if;

  update public.club_memberships set status='BANNED' where id=v_membership;
  if public.is_club_member_approved(v_club) then
    raise exception 'BANNED fue considerada membership aprobada';
  end if;
  if public.is_club_player(v_club, v_actor) then
    raise exception 'BANNED obtuvo condición deportiva';
  end if;

  update public.club_memberships
  set status='APPROVED', approved_at=null
  where id=v_membership;
  if public.is_club_member_approved(v_club) then
    raise exception 'APPROVED sin approved_at fue considerada aprobada';
  end if;
  if public.is_club_player(v_club, v_actor) then
    raise exception 'APPROVED sin approved_at obtuvo condición deportiva';
  end if;

  update public.club_memberships
  set status='APPROVED', approved_at=now(), approved_by=v_owner
  where id=v_membership;
  if not public.is_club_member_approved(v_club) then
    raise exception 'APPROVED con approved_at no fue considerada aprobada';
  end if;

  -- 6/8. Membership y club_players aprobados habilitan a cualquier rol.
  foreach v_capability in array array['PLAYER','PLANILLERO','OPERADOR','ADMIN'] loop
    update public.club_memberships
    set role=v_capability::public.club_role
    where id=v_membership;
    if not public.is_club_player(v_club, v_actor) or not public.is_club_player(v_club) then
      raise exception '% con club_players aprobado no fue considerado jugador', v_capability;
    end if;
  end loop;

  insert into public.club_players(
    club_id,user_id,display_name,category,gender,approved_at,approved_by
  ) values (
    v_club,v_owner,null,null,null,now(),v_owner
  ) on conflict(club_id,user_id) do update
    set approved_at=coalesce(public.club_players.approved_at,excluded.approved_at),
        approved_by=coalesce(public.club_players.approved_by,excluded.approved_by);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  if not public.is_club_player(v_club, v_owner) or not public.is_club_player(v_club) then
    raise exception 'OWNER con club_players aprobado no fue considerado jugador';
  end if;

  -- club_players.approved_at NULL siempre invalida la condición deportiva.
  update public.club_players set approved_at=null where id=v_player;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  if public.is_club_player(v_club, v_actor) then
    raise exception 'club_players con approved_at NULL habilitó condición deportiva';
  end if;
  update public.club_players set approved_at=now(),approved_by=v_owner where id=v_player;

  -- 9. role PLAYER sin club_players no basta.
  update public.club_memberships set role='PLAYER' where id=v_membership;
  delete from public.club_players where id=v_player;
  if public.is_club_player(v_club, v_actor) or public.is_club_player(v_club) then
    raise exception 'role PLAYER sin club_players fue considerado jugador';
  end if;

  -- Reponer únicamente el actor QA para las pruebas restantes.
  insert into public.club_players(
    club_id,user_id,display_name,category,gender,approved_at,approved_by
  ) values (
    v_club,v_actor,null,null,null,now(),v_owner
  ) returning id into v_player;

  -- 10. OWNER conserva todas las capabilities.
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  foreach v_capability in array v_all_capabilities loop
    if not public.has_club_capability(v_club,v_capability) then
      raise exception 'OWNER sin capability %', v_capability;
    end if;
  end loop;

  -- 11. ADMIN: todo salvo ownership:transfer.
  update public.club_memberships set role='ADMIN' where id=v_membership;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  foreach v_capability in array v_all_capabilities loop
    if public.has_club_capability(v_club,v_capability)
       is distinct from (v_capability <> 'ownership:transfer') then
      raise exception 'Matriz ADMIN incorrecta para %', v_capability;
    end if;
  end loop;

  -- 12/13. OPERADOR recibe exactamente su matriz, sin capacidades críticas.
  update public.club_memberships set role='OPERADOR' where id=v_membership;
  foreach v_capability in array v_all_capabilities loop
    if public.has_club_capability(v_club,v_capability)
       is distinct from (v_capability = any(v_operator_capabilities)) then
      raise exception 'Matriz OPERADOR incorrecta para %', v_capability;
    end if;
  end loop;

  -- 14. PLANILLERO recibe exclusivamente las cinco capacidades definidas.
  update public.club_memberships set role='PLANILLERO' where id=v_membership;
  foreach v_capability in array v_all_capabilities loop
    if public.has_club_capability(v_club,v_capability)
       is distinct from (v_capability = any(v_scorekeeper_capabilities)) then
      raise exception 'Matriz PLANILLERO incorrecta para %', v_capability;
    end if;
  end loop;

  -- 15. PLAYER no recibe ninguna capability administrativa.
  update public.club_memberships set role='PLAYER' where id=v_membership;
  foreach v_capability in array v_all_capabilities loop
    if public.has_club_capability(v_club,v_capability) then
      raise exception 'PLAYER obtuvo capability %', v_capability;
    end if;
  end loop;

  -- Las memberships que existían antes de QA conservan los campos solicitados.
  select md5(coalesce(string_agg(
    concat_ws('|', membership.id, membership.club_id, membership.user_id,
      membership.role::text, membership.status::text,
      coalesce(membership.approved_at::text, '<null>')),
    ',' order by membership.id
  ), '')) into v_after_memberships_hash
  from public.club_memberships membership
  where membership.id <> v_membership;

  if v_after_memberships_hash is distinct from v_existing_memberships_hash then
    raise exception 'Una membership preexistente cambió club_id, user_id, role, status o approved_at';
  end if;

  if exists (
    select 1 from public.club_memberships membership
    group by membership.club_id, membership.user_id
    having count(*) > 1
  ) then
    raise exception 'La QA produjo una membership duplicada';
  end if;

  return query select 'PASS',
    'Etapa 1 válida: enum, memberships, condición deportiva y matrices OWNER/ADMIN/OPERADOR/PLANILLERO/PLAYER';
exception when others then
  return query select 'FAIL', sqlerrm;
end;
$qa$;

select * from pg_temp.run_club_roles_stage1_qa();
rollback;
