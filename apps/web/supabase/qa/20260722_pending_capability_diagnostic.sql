-- Diagnóstico de PENDING con dashboard:view.
-- Solo lectura sobre datos de negocio. La rutina y los claims son temporales
-- y se eliminan/restauran con ROLLBACK.
begin;

create or replace function pg_temp.run_pending_capability_diagnostic()
returns table(section text, item text, value text)
language plpgsql
as $diagnostic$
declare
  v_club uuid;
  v_owner uuid;
  v_existing_target uuid;
  v_simulated_admin uuid;
  v_pending uuid;
  v_pending_source text;
  v_row record;
begin
  select membership.club_id,membership.user_id
    into v_club,v_owner
  from public.club_memberships membership
  where membership.role='OWNER'
    and membership.status='APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_club is null then
    return query select 'selection','error','No existe un club con OWNER APPROVED';
    return;
  end if;

  -- Replica, sin escribir, el orden de selección del verificador posterior.
  select membership.user_id into v_existing_target
  from public.club_memberships membership
  where membership.club_id=v_club
    and membership.role in ('ADMIN','PLANILLERO')
    and membership.status='APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  if v_existing_target is null then
    select candidate.id into v_simulated_admin
    from auth.users candidate
    where not exists(
      select 1 from public.club_memberships membership
      where membership.club_id=v_club and membership.user_id=candidate.id
    )
    order by candidate.created_at
    limit 1;
  end if;

  select membership.user_id into v_pending
  from public.club_memberships membership
  where membership.club_id=v_club and membership.status='PENDING'
  limit 1;

  if v_pending is not null then
    v_pending_source:='membership PENDING existente';
  else
    select candidate.id into v_pending
    from auth.users candidate
    where candidate.id is distinct from v_simulated_admin
      and not exists(
        select 1 from public.club_memberships membership
        where membership.club_id=v_club and membership.user_id=candidate.id
      )
    order by candidate.created_at
    limit 1;
    v_pending_source:='usuario que la QA convertiría temporalmente en PENDING';
  end if;

  if v_pending is null then
    return query select 'selection','club_id',v_club::text;
    return query select 'selection','error','No existe usuario que pueda actuar como PENDING';
    return;
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_pending::text,true);

  return query select 'selection','club_id',v_club::text;
  return query select 'selection','owner_user_id',v_owner::text;
  return query select 'selection','pending_user_id',v_pending::text;
  return query select 'selection','pending_source',v_pending_source;
  return query select 'selection','simulated_admin_user_id',coalesce(v_simulated_admin::text,'no requerido');
  return query select 'runtime','auth.uid()',coalesce(auth.uid()::text,'NULL');
  return query select 'runtime','request.jwt.claim.sub',coalesce(current_setting('request.jwt.claim.sub',true),'NULL');
  return query select 'runtime','request.jwt.claims',coalesce(current_setting('request.jwt.claims',true),'NULL');

  if exists(
    select 1 from public.club_memberships membership
    where membership.club_id=v_club and membership.user_id=v_pending
  ) then
    for v_row in
      select membership.id,membership.role,membership.status,membership.approved_at,
             membership.approved_by,membership.club_id,membership.user_id
      from public.club_memberships membership
      where membership.club_id=v_club and membership.user_id=v_pending
      order by membership.created_at
    loop
      return query select 'membership',v_row.id::text,jsonb_build_object(
        'club_id',v_row.club_id,
        'user_id',v_row.user_id,
        'role',v_row.role,
        'status',v_row.status,
        'approved_at',v_row.approved_at,
        'approved_by',v_row.approved_by
      )::text;
    end loop;
  else
    return query select 'membership','none','El actor no tiene membership persistente; la QA la crea como PLAYER/PENDING dentro de su transacción';
  end if;

  return query
  select 'platform_admin','is_platform_admin',exists(
    select 1 from public.platform_admins administrator where administrator.user_id=v_pending
  )::text;

  return query select 'authorization','is_club_owner',public.is_club_owner(v_club)::text;
  return query select 'authorization','is_club_admin',public.is_club_admin(v_club)::text;
  return query select 'authorization','has_club_capability(dashboard:view)',public.has_club_capability(v_club,'dashboard:view')::text;

  for v_row in
    select procedure.oid,
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) arguments,
           pg_catalog.pg_get_function_result(procedure.oid) return_type,
           procedure.prosecdef security_definer,
           procedure.proconfig settings,
           pg_catalog.pg_get_functiondef(procedure.oid) definition
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname='has_club_capability'
    order by procedure.oid
  loop
    return query select 'function.has_club_capability','oid',v_row.oid::text;
    return query select 'function.has_club_capability','arguments',v_row.arguments;
    return query select 'function.has_club_capability','return_type',v_row.return_type;
    return query select 'function.has_club_capability','security',case when v_row.security_definer then 'DEFINER' else 'INVOKER' end;
    return query select 'function.has_club_capability','settings',coalesce(array_to_string(v_row.settings,', '),'none');
    return query select 'function.has_club_capability','definition',v_row.definition;
  end loop;

  for v_row in
    select procedure.oid,procedure.proname,
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) arguments,
           procedure.prosecdef security_definer,
           procedure.proconfig settings,
           pg_catalog.pg_get_functiondef(procedure.oid) definition
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.proname in ('is_club_admin','is_club_owner','is_platform_admin')
    order by procedure.proname,procedure.oid
  loop
    return query select 'function.'||v_row.proname,'signature',format('%s(%s) [oid=%s]',v_row.proname,v_row.arguments,v_row.oid);
    return query select 'function.'||v_row.proname,'security',case when v_row.security_definer then 'DEFINER' else 'INVOKER' end;
    return query select 'function.'||v_row.proname,'settings',coalesce(array_to_string(v_row.settings,', '),'none');
    return query select 'function.'||v_row.proname,'definition',v_row.definition;
  end loop;

  for v_row in
    select procedure.oid,procedure.proname,
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) arguments,
           coalesce(grantee.rolname,'PUBLIC') grantee,
           grantor.rolname grantor,
           privilege.is_grantable
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) privilege
    left join pg_catalog.pg_roles grantee on grantee.oid=privilege.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=privilege.grantor
    where namespace.nspname='public'
      and procedure.proname in ('has_club_capability','is_club_admin','is_club_owner','is_platform_admin')
      and privilege.privilege_type='EXECUTE'
    order by procedure.proname,procedure.oid,grantee.rolname nulls first
  loop
    return query select 'grant.'||v_row.proname,
      format('%s(%s) [oid=%s]',v_row.proname,v_row.arguments,v_row.oid),
      format('EXECUTE: %s; grantor=%s; grantable=%s',v_row.grantee,v_row.grantor,v_row.is_grantable);
  end loop;
end;
$diagnostic$;

select * from pg_temp.run_pending_capability_diagnostic();
rollback;
