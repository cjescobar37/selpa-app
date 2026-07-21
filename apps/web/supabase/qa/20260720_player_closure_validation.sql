-- QA controlado del cierre Jugador (NO ejecutar en producción).
-- Requisitos:
--   1. Ejecutar primero las migraciones 20260720 en el orden documentado.
--   2. Usar el SQL editor de un proyecto QA con privilegios postgres.
--   3. Reemplazar los NULL del bloque de configuración por UUID reales.
--   4. La membresía objetivo debe ser PLAYER/PENDING y su perfil debe tener
--      first_name y last_name. qa_admin_user_id debe ser OWNER/ADMIN aprobado
--      del mismo club. qa_ordinary_user_id no debe administrarlo.
-- Todo el procedimiento termina con ROLLBACK.

begin;

create temporary table qa_player_closure_config (
  qa_admin_user_id uuid not null,
  qa_ordinary_user_id uuid not null,
  qa_target_user_id uuid not null,
  qa_target_membership_id uuid not null,
  qa_target_club_id uuid not null
) on commit drop;

-- REEMPLAZAR antes de ejecutar.
insert into qa_player_closure_config values (
  null, -- OWNER/ADMIN aprobado del club objetivo
  null, -- usuario autenticado común, sin administración sobre el club
  null, -- jugador de la solicitud pendiente
  null, -- club_memberships.id PLAYER/PENDING
  null  -- club_memberships.club_id
);

grant select on qa_player_closure_config to authenticated, anon;

do $$
declare c qa_player_closure_config%rowtype;
begin
  select * into c from qa_player_closure_config;
  if c.qa_admin_user_id is null
    or c.qa_ordinary_user_id is null
    or c.qa_target_user_id is null
    or c.qa_target_membership_id is null
    or c.qa_target_club_id is null then
    raise exception 'QA: completá todos los UUID de qa_player_closure_config.';
  end if;

  if not exists (
    select 1 from public.club_memberships m
    where m.id = c.qa_target_membership_id
      and m.club_id = c.qa_target_club_id
      and m.user_id = c.qa_target_user_id
      and m.role = 'PLAYER'::public.club_role
      and m.status = 'PENDING'::public.membership_status
  ) then
    raise exception 'QA: la membresía objetivo no es PLAYER/PENDING o no coincide con los IDs.';
  end if;

  if not exists (
    select 1 from public.club_memberships m
    where m.club_id = c.qa_target_club_id
      and m.user_id = c.qa_admin_user_id
      and m.role in ('OWNER'::public.club_role, 'ADMIN'::public.club_role)
      and m.status = 'APPROVED'::public.membership_status
      and m.approved_at is not null
  ) then
    raise exception 'QA: el actor configurado no es OWNER/ADMIN aprobado del club.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = c.qa_target_user_id
      and nullif(trim(coalesce(p.first_name, '')), '') is not null
      and nullif(trim(coalesce(p.last_name, '')), '') is not null
  ) then
    raise exception 'QA: el jugador objetivo no tiene first_name/last_name válidos.';
  end if;

  if exists (
    select 1 from public.user_settings s
    join public.club_memberships m
      on m.user_id = s.user_id and m.club_id = s.active_club_id
    where s.user_id = c.qa_target_user_id
      and m.status = 'APPROVED'::public.membership_status
      and m.approved_at is not null
  ) then
    raise exception 'QA: para probar la asignación inicial, el jugador objetivo no debe tener un club activo aprobado.';
  end if;
end;
$$;

create temporary table qa_membership_before as
select m.* from public.club_memberships m
join qa_player_closure_config c on c.qa_target_membership_id = m.id;

create temporary table qa_player_before as
select p.* from public.club_players p
join qa_player_closure_config c
  on c.qa_target_club_id = p.club_id and c.qa_target_user_id = p.user_id;

create temporary table qa_settings_before as
select s.* from public.user_settings s
join qa_player_closure_config c on c.qa_target_user_id = s.user_id;

-- 1. Aprobación exitosa, club_players y active_club_id.
savepoint qa_success;
select set_config('request.jwt.claim.sub', qa_admin_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
select * from public.approve_player_membership_atomic(
  (select qa_target_membership_id from qa_player_closure_config)
);
reset role;

do $$
declare c qa_player_closure_config%rowtype;
begin
  select * into c from qa_player_closure_config;
  if not exists (
    select 1 from public.club_memberships m
    where m.id = c.qa_target_membership_id
      and m.status = 'APPROVED'::public.membership_status
      and m.approved_by = c.qa_admin_user_id
      and m.approved_at is not null
  ) then raise exception 'QA FAIL: membresía no aprobada.'; end if;

  if not exists (
    select 1 from public.club_players p
    where p.club_id = c.qa_target_club_id
      and p.user_id = c.qa_target_user_id
      and p.approved_by = c.qa_admin_user_id
      and p.approved_at is not null
  ) then raise exception 'QA FAIL: club_players no fue creado/reparado.'; end if;

  if not exists (
    select 1 from public.user_settings s
    where s.user_id = c.qa_target_user_id
      and s.active_club_id = c.qa_target_club_id
  ) then raise exception 'QA FAIL: active_club_id no fue configurado.'; end if;
end;
$$;
rollback to savepoint qa_success;

-- 2. Usuario común sin permisos.
select set_config('request.jwt.claim.sub', qa_ordinary_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.approve_player_membership_atomic(
      (select qa_target_membership_id from qa_player_closure_config)
    );
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'QA FAIL: usuario común pudo aprobar.'; end if;
end;
$$;
reset role;

-- 3. Membresía inexistente.
select set_config('request.jwt.claim.sub', qa_admin_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.approve_player_membership_atomic(gen_random_uuid());
  exception when no_data_found then
    rejected := true;
  end;
  if not rejected then raise exception 'QA FAIL: no se rechazó la membresía inexistente.'; end if;
end;
$$;
reset role;

-- 4. Error intencional al final de la RPC: todo debe volver al estado previo.
create function pg_temp.qa_fail_active_club_write() returns trigger
language plpgsql as $$
begin
  if new.user_id = (select qa_target_user_id from qa_player_closure_config) then
    raise exception 'QA_ROLLBACK_FORCED';
  end if;
  return new;
end;
$$;

create trigger qa_force_rpc_rollback
before insert or update on public.user_settings
for each row execute function pg_temp.qa_fail_active_club_write();

select set_config('request.jwt.claim.sub', qa_admin_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
do $$
declare rolled_back boolean := false;
begin
  begin
    perform public.approve_player_membership_atomic(
      (select qa_target_membership_id from qa_player_closure_config)
    );
  exception when raise_exception then
    rolled_back := position('QA_ROLLBACK_FORCED' in sqlerrm) > 0;
  end;
  if not rolled_back then raise exception 'QA FAIL: no ocurrió el error intencional.'; end if;
end;
$$;
reset role;
drop trigger qa_force_rpc_rollback on public.user_settings;

do $$
begin
  if (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb)
    from public.club_memberships m
    join qa_player_closure_config c on c.qa_target_membership_id = m.id
  ) is distinct from (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
    from qa_membership_before b
  ) then raise exception 'QA FAIL: membership no hizo rollback.'; end if;

  if (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
    from public.club_players p
    join qa_player_closure_config c
      on c.qa_target_club_id = p.club_id and c.qa_target_user_id = p.user_id
  ) is distinct from (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb)
    from qa_player_before b
  ) then raise exception 'QA FAIL: club_players no hizo rollback.'; end if;

  if (
    select coalesce(jsonb_agg(to_jsonb(s) order by s.user_id), '[]'::jsonb)
    from public.user_settings s
    join qa_player_closure_config c on c.qa_target_user_id = s.user_id
  ) is distinct from (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.user_id), '[]'::jsonb)
    from qa_settings_before b
  ) then raise exception 'QA FAIL: user_settings no hizo rollback.'; end if;
end;
$$;

-- 5. player-assets: escritura propia, lectura pública y escritura ajena rechazada.
select set_config('request.jwt.claim.sub', qa_target_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
insert into storage.objects (bucket_id, name, owner_id)
select 'player-assets', 'avatars/' || qa_target_user_id || '/qa-policy.png', qa_target_user_id::text
from qa_player_closure_config;
reset role;

set local role anon;
do $$
begin
  if not exists (
    select 1 from storage.objects o
    join qa_player_closure_config c
      on o.name = 'avatars/' || c.qa_target_user_id || '/qa-policy.png'
    where o.bucket_id = 'player-assets'
  ) then raise exception 'QA FAIL: lectura pública de player-assets bloqueada.'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', qa_ordinary_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    select 'player-assets', 'covers/' || qa_target_user_id || '/qa-foreign.png', qa_ordinary_user_id::text
    from qa_player_closure_config;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'QA FAIL: escritura ajena permitida.'; end if;
end;
$$;
reset role;

-- 6. Notificaciones: authenticated no puede insertar libremente.
select set_config('request.jwt.claim.sub', qa_ordinary_user_id::text, true)
from qa_player_closure_config;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.notifications (user_id, type, title, message)
    select qa_ordinary_user_id, 'QA', 'No persistir', 'Debe ser rechazado'
    from qa_player_closure_config;
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'QA FAIL: inserción libre de notificaciones permitida.'; end if;
end;
$$;
reset role;

-- Resultado esperado: todas las sentencias anteriores completan y este rollback
-- elimina cualquier objeto/fila temporal de QA.
rollback;
