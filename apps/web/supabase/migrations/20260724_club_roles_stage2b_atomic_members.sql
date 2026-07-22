-- CLUB Equipo y Roles, etapa 2B: roles, remoción y ownership atómicos.
-- Aplicar después de 20260724_club_roles_stage2a_atomic_invites.sql.

begin;

do $$
declare
  v_conflicts text;
begin
  select string_agg(conflict.club_id::text || ' (' || conflict.owner_count || ')', ', ')
    into v_conflicts
  from (
    select membership.club_id, count(*) owner_count
    from public.club_memberships membership
    where membership.role = 'OWNER'
      and membership.status = 'APPROVED'
      and membership.approved_at is not null
    group by membership.club_id
    having count(*) > 1
  ) conflict;

  if v_conflicts is not null then
    raise exception 'Etapa 2B no aplicable: clubes con múltiples OWNER aprobados: %', v_conflicts;
  end if;
end
$$;

create unique index if not exists idx_club_memberships_single_approved_owner
  on public.club_memberships(club_id)
  where role = 'OWNER' and status = 'APPROVED' and approved_at is not null;

-- Las mutaciones administrativas quedan exclusivamente detrás de RPC service_role.
-- INSERT conserva la policy de solicitudes PLAYER/PENDING y SELECT no cambia.
drop policy if exists club_memberships_update on public.club_memberships;
drop policy if exists club_memberships_delete on public.club_memberships;

create or replace function public.protect_club_owner_membership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_transfer_owner name;
  v_transfer_allowed boolean;
begin
  select pg_catalog.pg_get_userbyid(proc.proowner)
    into v_transfer_owner
  from pg_catalog.pg_proc proc
  where proc.oid = 'public.transfer_club_ownership_atomic(uuid,uuid,uuid)'::regprocedure;

  v_transfer_allowed :=
    current_setting('selpa.allow_owner_transfer', true) is not distinct from 'on'
    and current_setting('selpa.owner_transfer_context', true) is not distinct from 'transfer_club_ownership_atomic'
    and current_user = v_transfer_owner;

  if tg_op = 'DELETE' then
    if old.role = 'OWNER' and not v_transfer_allowed then
      raise exception 'SELPA_CODE:owner_role_protected' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.role = 'OWNER' and (
    new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.approved_at is distinct from old.approved_at
    or new.user_id is distinct from old.user_id
    or new.club_id is distinct from old.club_id
  ) and not v_transfer_allowed then
    raise exception 'SELPA_CODE:owner_role_protected' using errcode = 'P0001';
  end if;

  if old.role <> 'OWNER' and new.role = 'OWNER' and not v_transfer_allowed then
    raise exception 'SELPA_CODE:cannot_assign_owner' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_club_owner_membership on public.club_memberships;
create trigger trg_protect_club_owner_membership
before update or delete on public.club_memberships
for each row execute function public.protect_club_owner_membership();

create or replace function public.change_club_staff_role_atomic(
  p_club_id uuid,
  p_membership_id uuid,
  p_new_role public.club_role,
  p_actor_user_id uuid
)
returns public.club_memberships
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor public.club_memberships;
  v_target public.club_memberships;
  v_old_role public.club_role;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users users where users.id=p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode='P0001';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_club_id::text, 2)) then
    raise exception 'SELPA_CODE:concurrent_update' using errcode='P0001';
  end if;

  select membership.* into v_actor
  from public.club_memberships membership
  where membership.club_id=p_club_id and membership.user_id=p_actor_user_id
  for update;
  if not found or v_actor.status <> 'APPROVED' or v_actor.approved_at is null
     or v_actor.role::text not in ('OWNER','ADMIN') then
    raise exception 'SELPA_CODE:forbidden' using errcode='P0001';
  end if;

  if p_new_role is null or p_new_role::text not in ('ADMIN','OPERADOR','PLANILLERO','PLAYER') then
    if p_new_role::text = 'OWNER' then
      raise exception 'SELPA_CODE:cannot_assign_owner' using errcode='P0001';
    end if;
    raise exception 'SELPA_CODE:invalid_role' using errcode='P0001';
  end if;

  select membership.* into v_target
  from public.club_memberships membership
  where membership.id=p_membership_id
  for update;
  if not found then raise exception 'SELPA_CODE:member_not_found' using errcode='P0001'; end if;
  if v_target.club_id <> p_club_id then raise exception 'SELPA_CODE:cross_club_forbidden' using errcode='P0001'; end if;
  if v_target.status <> 'APPROVED' or v_target.approved_at is null then
    raise exception 'SELPA_CODE:membership_not_approved' using errcode='P0001';
  end if;
  if v_target.role = 'OWNER' then raise exception 'SELPA_CODE:owner_role_protected' using errcode='P0001'; end if;
  if v_target.user_id = p_actor_user_id then raise exception 'SELPA_CODE:cannot_modify_self' using errcode='P0001'; end if;
  if v_target.role = p_new_role then raise exception 'SELPA_CODE:role_unchanged' using errcode='P0001'; end if;

  v_old_role := v_target.role;
  update public.club_memberships as membership
  set role=p_new_role, updated_at=now()
  where membership.id=v_target.id
  returning membership.* into v_target;

  insert into public.club_team_audit(
    club_id,actor_user_id,action,target_user_id,membership_id,old_role,new_role,metadata
  ) values (
    p_club_id,p_actor_user_id,'ROLE_CHANGED',v_target.user_id,v_target.id,v_old_role,p_new_role,
    jsonb_build_object(
      'membership_id',v_target.id,'target_user_id',v_target.user_id,
      'previous_role',v_old_role,'new_role',p_new_role,
      'previous_status',v_target.status,'actor_role',v_actor.role
    )
  );
  return v_target;
end;
$$;

create or replace function public.remove_club_staff_atomic(
  p_club_id uuid,
  p_membership_id uuid,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_actor public.club_memberships;
  v_target public.club_memberships;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users users where users.id=p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode='P0001';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_club_id::text, 2)) then
    raise exception 'SELPA_CODE:concurrent_update' using errcode='P0001';
  end if;

  select membership.* into v_actor
  from public.club_memberships membership
  where membership.club_id=p_club_id and membership.user_id=p_actor_user_id
  for update;
  if not found or v_actor.status <> 'APPROVED' or v_actor.approved_at is null
     or v_actor.role::text not in ('OWNER','ADMIN') then
    raise exception 'SELPA_CODE:forbidden' using errcode='P0001';
  end if;

  select membership.* into v_target
  from public.club_memberships membership
  where membership.id=p_membership_id
  for update;
  if not found then raise exception 'SELPA_CODE:member_not_found' using errcode='P0001'; end if;
  if v_target.club_id <> p_club_id then raise exception 'SELPA_CODE:cross_club_forbidden' using errcode='P0001'; end if;
  if v_target.status <> 'APPROVED' or v_target.approved_at is null then
    raise exception 'SELPA_CODE:membership_not_approved' using errcode='P0001';
  end if;
  if v_target.role = 'OWNER' then raise exception 'SELPA_CODE:cannot_remove_owner' using errcode='P0001'; end if;
  if v_target.user_id = p_actor_user_id then raise exception 'SELPA_CODE:cannot_modify_self' using errcode='P0001'; end if;

  delete from public.club_memberships as membership where membership.id=v_target.id;

  update public.user_settings as settings
  set active_club_id = (
    select membership.club_id
    from public.club_memberships membership
    where membership.user_id=v_target.user_id
      and membership.status='APPROVED' and membership.approved_at is not null
    order by membership.approved_at desc nulls last limit 1
  ), updated_at=now()
  where settings.user_id=v_target.user_id and settings.active_club_id=p_club_id;

  insert into public.club_team_audit(
    club_id,actor_user_id,action,target_user_id,membership_id,old_role,metadata
  ) values (
    p_club_id,p_actor_user_id,'MEMBER_REMOVED',v_target.user_id,v_target.id,v_target.role,
    jsonb_build_object(
      'membership_id',v_target.id,'target_user_id',v_target.user_id,
      'previous_role',v_target.role,'previous_status',v_target.status,
      'approved_at',v_target.approved_at,'actor_role',v_actor.role
    )
  );
  return v_target.id;
end;
$$;

create or replace function public.transfer_club_ownership_atomic(
  p_club_id uuid,
  p_new_owner_membership_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_owner public.club_memberships;
  v_target public.club_memberships;
  v_previous_allow text := current_setting('selpa.allow_owner_transfer', true);
  v_previous_context text := current_setting('selpa.owner_transfer_context', true);
  v_owner_count integer;
  v_result jsonb;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users users where users.id=p_actor_user_id) then
    raise exception 'SELPA_CODE:unauthorized' using errcode='P0001';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_club_id::text, 2)) then
    raise exception 'SELPA_CODE:concurrent_update' using errcode='P0001';
  end if;

  select membership.* into v_owner
  from public.club_memberships membership
  where membership.club_id=p_club_id and membership.user_id=p_actor_user_id
  for update;
  if not found or v_owner.role <> 'OWNER' or v_owner.status <> 'APPROVED' or v_owner.approved_at is null then
    raise exception 'SELPA_CODE:forbidden' using errcode='P0001';
  end if;

  select membership.* into v_target
  from public.club_memberships membership
  where membership.id=p_new_owner_membership_id
  for update;
  if not found then raise exception 'SELPA_CODE:ownership_target_invalid' using errcode='P0001'; end if;
  if v_target.club_id <> p_club_id then raise exception 'SELPA_CODE:cross_club_forbidden' using errcode='P0001'; end if;
  if v_target.user_id=p_actor_user_id then raise exception 'SELPA_CODE:ownership_same_user' using errcode='P0001'; end if;
  if v_target.status <> 'APPROVED' or v_target.approved_at is null then
    raise exception 'SELPA_CODE:ownership_target_not_approved' using errcode='P0001';
  end if;
  if v_target.role::text not in ('ADMIN','OPERADOR') then
    raise exception 'SELPA_CODE:ownership_target_role_invalid' using errcode='P0001';
  end if;

  perform set_config('selpa.allow_owner_transfer','on',true);
  perform set_config('selpa.owner_transfer_context','transfer_club_ownership_atomic',true);
  begin
    update public.club_memberships as membership
    set role='ADMIN',updated_at=now() where membership.id=v_owner.id;
    update public.club_memberships as membership
    set role='OWNER',updated_at=now() where membership.id=v_target.id;

    select count(*) into v_owner_count
    from public.club_memberships membership
    where membership.club_id=p_club_id and membership.role='OWNER'
      and membership.status='APPROVED' and membership.approved_at is not null;
    if v_owner_count <> 1 then
      raise exception 'SELPA_CODE:concurrent_update' using errcode='P0001';
    end if;

    insert into public.club_team_audit(
      club_id,actor_user_id,action,target_user_id,membership_id,old_role,new_role,metadata
    ) values (
      p_club_id,p_actor_user_id,'OWNERSHIP_TRANSFERRED',v_target.user_id,v_target.id,
      v_target.role,'OWNER',jsonb_build_object(
        'previous_owner_membership_id',v_owner.id,
        'previous_owner_user_id',v_owner.user_id,
        'new_owner_membership_id',v_target.id,
        'new_owner_user_id',v_target.user_id,
        'previous_owner_role',v_owner.role,
        'previous_target_role',v_target.role,
        'resulting_previous_owner_role','ADMIN',
        'resulting_new_owner_role','OWNER'
      )
    );
    v_result := jsonb_build_object(
      'previous_owner_membership_id',v_owner.id,'previous_owner_user_id',v_owner.user_id,
      'new_owner_membership_id',v_target.id,'new_owner_user_id',v_target.user_id
    );
  exception when others then
    perform set_config('selpa.allow_owner_transfer',coalesce(v_previous_allow,''),true);
    perform set_config('selpa.owner_transfer_context',coalesce(v_previous_context,''),true);
    raise;
  end;
  perform set_config('selpa.allow_owner_transfer',coalesce(v_previous_allow,''),true);
  perform set_config('selpa.owner_transfer_context',coalesce(v_previous_context,''),true);
  return v_result;
end;
$$;

revoke all on function public.change_club_staff_role_atomic(uuid,uuid,public.club_role,uuid) from public,anon,authenticated;
revoke all on function public.remove_club_staff_atomic(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.transfer_club_ownership_atomic(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.change_club_staff_role_atomic(uuid,uuid,public.club_role,uuid) to service_role;
grant execute on function public.remove_club_staff_atomic(uuid,uuid,uuid) to service_role;
grant execute on function public.transfer_club_ownership_atomic(uuid,uuid,uuid) to service_role;

commit;
