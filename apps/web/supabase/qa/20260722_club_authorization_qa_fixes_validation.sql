-- Verificación posterior de 20260722_club_authorization_qa_fixes.sql.
-- Ejecutar completa en Supabase SQL Editor. No deja cambios persistentes.
begin;

create or replace function pg_temp.run_club_authorization_fixes_qa()
returns table(status text, detail text)
language plpgsql
as $qa$
declare
  v_club uuid;
  v_owner uuid;
  v_owner_membership uuid;
  v_target_membership uuid;
  v_pending uuid;
  v_candidate uuid;
  v_capability text;
  v_capabilities constant text[] := array[
    'dashboard:view','club:view','club:update','club:branding',
    'memberships:view','memberships:manage','roles:view','roles:manage','ownership:transfer',
    'players:view','players:manage','players:private_view','ranking:view','ranking:manage',
    'tournaments:view','tournaments:create','tournaments:update','tournaments:publish',
    'tournaments:cancel','tournaments:delete','registrations:view','registrations:manage',
    'groups:generate','matches:view','matches:update','matches:schedule','playoff:generate',
    'finance:view','finance:manage','payments:view','payments:manage',
    'content:view','news:manage','sponsors:manage','ads:manage',
    'messages:view','messages:reply','audit:view','security:manage'
  ];
begin
  select membership.club_id,membership.user_id,membership.id
    into v_club,v_owner,v_owner_membership
  from public.club_memberships membership
  where membership.role='OWNER' and membership.status='APPROVED'
    and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_club is null then
    return query select 'FAIL','QA no ejecutable: falta club con OWNER APPROVED'; return;
  end if;

  select membership.id into v_target_membership
  from public.club_memberships membership
  where membership.club_id=v_club and membership.role in ('ADMIN','PLANILLERO')
    and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_target_membership is null then
    select candidate.id into v_candidate
    from auth.users candidate
    where not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club and membership.user_id=candidate.id
    )
    order by candidate.created_at
    limit 1;

    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para crear ADMIN temporal';
      return;
    end if;

    insert into public.club_memberships(
      club_id,user_id,role,status,approved_at,approved_by
    ) values (
      v_club,v_candidate,'ADMIN','APPROVED',now(),v_owner
    )
    returning id into v_target_membership;
  end if;

  select membership.user_id into v_pending
  from public.club_memberships membership
  where membership.club_id=v_club and membership.status='PENDING'
  limit 1;
  if v_pending is null then
    select candidate.id into v_candidate
    from auth.users candidate
    where not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club and membership.user_id=candidate.id)
    order by candidate.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: falta usuario disponible para PENDING'; return;
    end if;
    insert into public.club_memberships(club_id,user_id,role,status)
    values(v_club,v_candidate,'PLAYER','PENDING');
    v_pending:=v_candidate;
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_pending::text,true);
  if auth.uid() is distinct from v_pending then
    raise exception 'La simulación auth.uid() no seleccionó al actor PENDING';
  end if;
  if exists(
    select 1 from public.club_memberships membership
    where membership.club_id=v_club and membership.user_id=v_pending
      and membership.status='APPROVED' and membership.approved_at is not null
  ) then
    raise exception 'El actor elegido como PENDING también tiene una membership aprobada en el club';
  end if;
  if public.has_club_capability(v_club,'dashboard:view') then
    raise exception 'PENDING obtuvo dashboard:view';
  end if;
  foreach v_capability in array v_capabilities loop
    if public.has_club_capability(v_club,v_capability) then
      raise exception 'PENDING obtuvo capability: %',v_capability;
    end if;
  end loop;

  begin
    update public.club_memberships set role='ADMIN' where id=v_owner_membership;
    raise exception 'UPDATE directo del OWNER permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.club_memberships where id=v_owner_membership;
    raise exception 'DELETE directo del OWNER permitido';
  exception when insufficient_privilege then null;
  end;

  perform public.transfer_club_ownership_atomic(v_club,v_target_membership,v_owner);
  if (select membership.role='ADMIN' from public.club_memberships membership where membership.id=v_owner_membership) is distinct from true
    or (select membership.role='OWNER' from public.club_memberships membership where membership.id=v_target_membership) is distinct from true then
    raise exception 'La transferencia atómica no produjo los roles esperados';
  end if;
  if current_setting('selpa.allow_owner_transfer',true) is not distinct from 'on' then
    raise exception 'La transferencia dejó habilitado el bypass del trigger';
  end if;

  return query select 'PASS','PENDING sin capacidades; OWNER protegido; transferencia atómica permitida';
exception when others then
  return query select 'FAIL',sqlerrm;
end;
$qa$;

select * from pg_temp.run_club_authorization_fixes_qa();
rollback;
