-- CLUB Equipo y Roles, etapa 1: roles canónicos, autorización y condición deportiva.
-- Aplicar después de 20260722_club_authorization_qa_fixes.sql.

begin;

-- La normalización conserva el OID del valor enum: no reconstruye el tipo ni
-- reescribe columnas, defaults, constraints o argumentos de funciones.
do $$
declare
  v_has_operativo boolean;
  v_has_operador boolean;
  v_missing_base_roles text[];
  v_dependency_count integer;
begin
  if to_regtype('public.club_role') is null then
    raise exception 'Preflight CLUB roles: public.club_role no existe';
  end if;

  select array_agg(required_role order by required_role)
    into v_missing_base_roles
  from unnest(array['OWNER', 'ADMIN', 'PLANILLERO', 'PLAYER']) required_role
  where not exists (
    select 1 from pg_catalog.pg_enum enum_value
    where enum_value.enumtypid = 'public.club_role'::regtype
      and enum_value.enumlabel = required_role
  );

  if v_missing_base_roles is not null then
    raise exception 'Preflight CLUB roles: faltan valores base: %',
      array_to_string(v_missing_base_roles, ', ');
  end if;

  select exists (
    select 1 from pg_catalog.pg_enum
    where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERATIVO'
  ), exists (
    select 1 from pg_catalog.pg_enum
    where enumtypid = 'public.club_role'::regtype and enumlabel = 'OPERADOR'
  ) into v_has_operativo, v_has_operador;

  if v_has_operativo and v_has_operador then
    raise exception 'Preflight CLUB roles: OPERATIVO y OPERADOR coexisten; conciliación manual requerida';
  elsif v_has_operativo then
    alter type public.club_role rename value 'OPERATIVO' to 'OPERADOR';
    raise notice 'CLUB roles: OPERATIVO renombrado a OPERADOR preservando OID y dependencias';
  elsif not v_has_operador then
    alter type public.club_role add value 'OPERADOR';
    raise notice 'CLUB roles: OPERADOR agregado; no existía valor legacy';
  else
    raise notice 'CLUB roles: OPERADOR ya estaba normalizado';
  end if;

  select count(*) into v_dependency_count
  from pg_catalog.pg_depend dependency
  where dependency.refobjid = 'public.club_role'::regtype;
  raise notice 'CLUB roles: % dependencias conservadas; enum no reconstruido', v_dependency_count;
end
$$;

create or replace function public.is_club_member_approved(p_club_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.club_memberships membership
    where membership.club_id = p_club_id
      and membership.user_id = auth.uid()
      and membership.status = 'APPROVED'
      and membership.approved_at is not null
  );
$$;

comment on function public.is_club_member_approved(uuid) is
  'Pertenencia canónica: exige membership APPROVED y approved_at para auth.uid().';

-- club_players es la fuente deportiva, pero nunca concede acceso por sí sola.
-- En el esquema actual su única señal de vigencia deportiva es approved_at.
create or replace function public.is_club_player(
  p_club_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.club_memberships membership
    join public.club_players player
      on player.club_id = membership.club_id
     and player.user_id = membership.user_id
    where membership.club_id = p_club_id
      and membership.user_id = p_user_id
      and membership.status = 'APPROVED'
      and membership.approved_at is not null
      and player.approved_at is not null
  );
$$;

comment on function public.is_club_player(uuid, uuid) is
  'Condición deportiva canónica: membership aprobada y club_players aprobado para el mismo usuario y club.';

create or replace function public.has_club_capability(p_club_id uuid, p_capability text)
returns boolean language plpgsql stable security definer
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
    'messages:view', 'messages:reply', 'reports:operational_view', 'audit:view', 'security:manage'
  ) then
    raise exception 'Unknown club capability: %', p_capability using errcode = '22023';
  end if;

  select membership.role into v_role
  from public.club_memberships membership
  where membership.club_id = p_club_id
    and membership.user_id = auth.uid()
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  limit 1;

  -- Comparar como texto mantiene toda la migración atómica incluso en una base
  -- excepcional donde OPERADOR deba agregarse en esta misma transacción.
  if v_role::text = 'OWNER' then return true; end if;
  if v_role::text = 'ADMIN' then return v_capability <> 'ownership:transfer'; end if;
  if v_role::text = 'OPERADOR' then
    return v_capability in (
      'dashboard:view', 'club:view', 'memberships:view', 'memberships:manage',
      'players:view', 'players:manage', 'players:private_view',
      'ranking:view', 'ranking:manage', 'tournaments:view', 'tournaments:create',
      'tournaments:update', 'tournaments:publish', 'tournaments:cancel',
      'registrations:view', 'registrations:manage', 'groups:generate',
      'matches:view', 'matches:update', 'matches:schedule', 'playoff:generate',
      'content:view', 'news:manage', 'sponsors:manage', 'ads:manage',
      'messages:view', 'messages:reply', 'reports:operational_view'
    );
  end if;
  if v_role::text = 'PLANILLERO' then
    return v_capability in (
      'dashboard:view', 'club:view', 'tournaments:view', 'matches:view', 'matches:update'
    );
  end if;
  return false;
end;
$$;

comment on function public.has_club_capability(uuid, text) is
  'Matriz canónica CLUB: OWNER total; ADMIN salvo ownership; OPERADOR operativo; PLANILLERO cancha; PLAYER sin administración.';

revoke all on function public.is_club_member_approved(uuid) from public;
revoke all on function public.is_club_player(uuid, uuid) from public, anon;
revoke all on function public.has_club_capability(uuid, text) from public, anon;
grant execute on function public.is_club_member_approved(uuid) to anon, authenticated, service_role;
grant execute on function public.is_club_player(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_club_capability(uuid, text) to authenticated, service_role;

commit;
