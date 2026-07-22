-- Correcciones detectadas por QA de autorización CLUB y protección del OWNER.
-- Aplicar después de:
--   20260721_club_authorization_security.sql
--   20260722_club_team_roles_closure.sql

begin;

-- Reafirma en la base activa que solamente una membresía aprobada y con fecha
-- de aprobación puede otorgar capacidades.
create or replace function public.is_club_owner(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
      and membership.status = 'APPROVED'
      and membership.approved_at is not null
      and membership.role = 'OWNER'
  );
$$;

create or replace function public.is_club_admin(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
      and membership.status = 'APPROVED'
      and membership.approved_at is not null
      and membership.role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function public.has_club_capability(p_club_id uuid, p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role public.club_role;
  v_capability text := lower(btrim(coalesce(p_capability, '')));
begin
  if v_capability not in (
    'dashboard:view', 'club:view', 'club:update', 'club:branding',
    'memberships:view', 'memberships:manage', 'roles:view', 'roles:manage', 'ownership:transfer',
    'players:view', 'players:manage', 'players:private_view', 'ranking:view', 'ranking:manage',
    'tournaments:view', 'tournaments:create', 'tournaments:update', 'tournaments:publish',
    'tournaments:cancel', 'tournaments:delete', 'registrations:view', 'registrations:manage',
    'groups:generate', 'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
    'finance:view', 'finance:manage', 'payments:view', 'payments:manage',
    'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
    'messages:view', 'messages:reply', 'audit:view', 'security:manage'
  ) then
    raise exception 'Unknown club capability: %', p_capability using errcode = '22023';
  end if;

  select membership.role
    into v_role
  from public.club_memberships membership
  where membership.club_id = p_club_id
    and membership.user_id = auth.uid()
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  limit 1;

  if v_role = 'OWNER' then return true; end if;
  if v_role = 'ADMIN' then return v_capability <> 'ownership:transfer'; end if;
  if v_role is distinct from 'PLANILLERO' then return false; end if;

  return v_capability in (
    'dashboard:view', 'club:view', 'players:view', 'ranking:view', 'tournaments:view',
    'registrations:view', 'registrations:manage', 'groups:generate', 'matches:view',
    'matches:update', 'matches:schedule', 'playoff:generate', 'payments:view',
    'messages:view', 'messages:reply'
  );
end;
$$;

-- NULL debe significar "transferencia no autorizada". También protege todos
-- los campos que definen la identidad y vigencia de la membresía OWNER.
create or replace function public.protect_club_owner_membership()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_transfer_allowed boolean :=
    current_setting('selpa.allow_owner_transfer', true) is not distinct from 'on';
begin
  if old.role <> 'OWNER' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not v_transfer_allowed then
      raise exception 'OWNER membership requires atomic ownership transfer' using errcode='42501';
    end if;
    return old;
  end if;

  if (
    new.role is distinct from old.role
    or new.status is distinct from old.status
    or new.approved_at is distinct from old.approved_at
    or new.user_id is distinct from old.user_id
    or new.club_id is distinct from old.club_id
  ) and not v_transfer_allowed then
    raise exception 'OWNER membership requires atomic ownership transfer' using errcode='42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_club_owner_membership on public.club_memberships;
create trigger trg_protect_club_owner_membership
before update or delete on public.club_memberships
for each row execute function public.protect_club_owner_membership();

-- La excepción del trigger vive solamente durante las dos escrituras internas
-- de la transferencia y siempre se restablece, también si ocurre un error.
create or replace function public.transfer_club_ownership_atomic(
  p_club_id uuid,
  p_new_owner_membership_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner public.club_memberships;
  v_target public.club_memberships;
  v_previous_transfer_setting text := current_setting('selpa.allow_owner_transfer', true);
  v_result jsonb;
begin
  select * into v_owner
  from public.club_memberships membership
  where membership.club_id=p_club_id
    and membership.user_id=p_actor_user_id
    and membership.role='OWNER'
    and membership.status='APPROVED'
    and membership.approved_at is not null
  for update;
  if not found then
    raise exception 'Only current OWNER can transfer ownership' using errcode='42501';
  end if;

  select * into v_target
  from public.club_memberships membership
  where membership.id=p_new_owner_membership_id
    and membership.club_id=p_club_id
    and membership.status='APPROVED'
    and membership.approved_at is not null
    and membership.role in ('ADMIN','PLANILLERO')
  for update;
  if not found then
    raise exception 'Eligible target membership not found' using errcode='P0002';
  end if;

  perform set_config('selpa.allow_owner_transfer','on',true);
  begin
    update public.club_memberships
    set role='ADMIN', updated_at=now()
    where id=v_owner.id;

    update public.club_memberships
    set role='OWNER', updated_at=now()
    where id=v_target.id;

    insert into public.club_team_audit(
      club_id,actor_user_id,action,target_user_id,membership_id,
      old_role,new_role,metadata
    ) values (
      p_club_id,p_actor_user_id,'OWNERSHIP_TRANSFERRED',v_target.user_id,v_target.id,
      v_target.role,'OWNER',jsonb_build_object(
        'previous_owner_user_id',v_owner.user_id,
        'previous_owner_membership_id',v_owner.id
      )
    );

    v_result := jsonb_build_object(
      'previous_owner_membership_id',v_owner.id,
      'new_owner_membership_id',v_target.id
    );
  exception when others then
    perform set_config('selpa.allow_owner_transfer',coalesce(v_previous_transfer_setting,''),true);
    raise;
  end;

  perform set_config('selpa.allow_owner_transfer',coalesce(v_previous_transfer_setting,''),true);
  return v_result;
end;
$$;

commit;
