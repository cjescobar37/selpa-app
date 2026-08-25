-- QA transaccional: lifecycle canónico de jugadores.
-- Requiere un club con OWNER aprobado, cuatro cuentas auth sin membresía en ese
-- club y un torneo OPEN con inscripción vigente. No persiste fixtures.
begin;

create temporary table qa_player_lifecycle_config (
  club_id uuid not null,
  owner_user_id uuid not null,
  player_user_id uuid not null,
  partner_user_id uuid not null,
  staff_user_id uuid not null,
  tournament_id uuid not null,
  owner_player_id uuid not null,
  player_id uuid not null,
  partner_player_id uuid not null,
  staff_player_id uuid not null,
  manual_player_id uuid not null
) on commit drop;

do $$
declare
  v_club uuid;
  v_owner uuid;
  v_player uuid;
  v_partner uuid;
  v_staff uuid;
  v_tournament uuid;
  v_owner_player_id uuid;
  v_player_id uuid;
  v_partner_id uuid;
  v_staff_id uuid;
  v_manual_id uuid;
begin
  select m.club_id, m.user_id into v_club, v_owner
  from public.club_memberships m
  where m.role = 'OWNER'::public.club_role
    and m.status = 'APPROVED'::public.membership_status
    and m.approved_at is not null
  order by m.created_at
  limit 1;
  if v_club is null then raise exception 'QA FAIL: falta un OWNER aprobado.'; end if;

  select t.id into v_tournament
  from public.tournaments t
  where t.club_id = v_club
    and t.status = 'OPEN'
    and (t.registration_deadline is null or t.registration_deadline > now())
  order by t.created_at desc limit 1;
  if v_tournament is null then
    raise exception 'QA FAIL: falta un torneo OPEN con inscripción vigente para ejercitar register_team_for_tournament.';
  end if;

  select u.id into v_player from auth.users u
  where u.id <> v_owner
    and not exists (select 1 from public.club_memberships m where m.club_id=v_club and m.user_id=u.id)
    and not exists (select 1 from public.club_players p where p.club_id=v_club and p.user_id=u.id)
  order by u.created_at limit 1;
  select u.id into v_partner from auth.users u
  where u.id <> v_owner and u.id <> v_player
    and not exists (select 1 from public.club_memberships m where m.club_id=v_club and m.user_id=u.id)
    and not exists (select 1 from public.club_players p where p.club_id=v_club and p.user_id=u.id)
  order by u.created_at limit 1;
  select u.id into v_staff from auth.users u
  where u.id <> v_owner and u.id <> v_player and u.id <> v_partner
    and not exists (select 1 from public.club_memberships m where m.club_id=v_club and m.user_id=u.id)
    and not exists (select 1 from public.club_players p where p.club_id=v_club and p.user_id=u.id)
  order by u.created_at limit 1;
  if v_player is null or v_partner is null or v_staff is null then
    raise exception 'QA FAIL: faltan tres cuentas auth libres para los fixtures transaccionales.';
  end if;

  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at)
  values
    (v_club,v_player,'PLAYER','APPROVED',v_owner,now()),
    (v_club,v_partner,'PLAYER','APPROVED',v_owner,now()),
    (v_club,v_staff,'ADMIN','APPROVED',v_owner,now());
  insert into public.club_players(club_id,user_id,display_name,approved_at,approved_by)
  values
    (v_club,v_player,'QA lifecycle player',now(),v_owner),
    (v_club,v_partner,'QA lifecycle partner',now(),v_owner),
    (v_club,v_staff,'QA lifecycle staff',now(),v_owner),
    (v_club,null,'QA lifecycle manual',now(),v_owner);
  insert into public.club_players(club_id,user_id,display_name,approved_at,approved_by)
  select v_club,v_owner,'QA lifecycle owner',now(),v_owner
  where not exists (select 1 from public.club_players p where p.club_id=v_club and p.user_id=v_owner);
  select id into v_owner_player_id from public.club_players where club_id=v_club and user_id=v_owner;
  select id into v_player_id from public.club_players where club_id=v_club and user_id=v_player;
  select id into v_partner_id from public.club_players where club_id=v_club and user_id=v_partner;
  select id into v_staff_id from public.club_players where club_id=v_club and user_id=v_staff;
  select id into v_manual_id from public.club_players where club_id=v_club and user_id is null and display_name='QA lifecycle manual';
  insert into qa_player_lifecycle_config values(v_club,v_owner,v_player,v_partner,v_staff,v_tournament,v_owner_player_id,v_player_id,v_partner_id,v_staff_id,v_manual_id);
end;
$$;

-- Account player: initial real registration gives us historical data to preserve.
select set_config('request.jwt.claim.sub', player_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select * from public.register_team_for_tournament(
  (select tournament_id from qa_player_lifecycle_config),
  (select club_id from qa_player_lifecycle_config),
  (select partner_user_id from qa_player_lifecycle_config)
);
reset role;

-- OWNER blocks: membership access and new registration stop, history remains.
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select player_id from qa_player_lifecycle_config),'QA bloqueo');
reset role;

do $$
begin
  if not exists (select 1 from public.club_players p join qa_player_lifecycle_config c on c.player_id=p.id where p.operational_status='BLOCKED') then raise exception 'QA FAIL: BLOCKED no fue persistido.'; end if;
  if not exists (select 1 from public.club_memberships m join qa_player_lifecycle_config c on c.club_id=m.club_id and c.player_user_id=m.user_id where m.status='BANNED') then raise exception 'QA FAIL: membership no pasó a BANNED.'; end if;
  if not exists (select 1 from public.tournament_teams tt join qa_player_lifecycle_config c on tt.tournament_id=c.tournament_id where tt.player1_user_id=c.player_user_id or tt.player2_user_id=c.player_user_id) then raise exception 'QA FAIL: se perdió una inscripción existente.'; end if;
end $$;

select set_config('request.jwt.claim.sub', player_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin
    perform public.register_team_for_tournament((select tournament_id from qa_player_lifecycle_config),(select club_id from qa_player_lifecycle_config),(select partner_user_id from qa_player_lifecycle_config));
    raise exception 'QA FAIL: BLOCKED pudo registrarse.';
  exception when check_violation then
    if position('CLUB_PLAYER_NOT_ELIGIBLE' in sqlerrm)=0 then raise; end if;
  end;
end $$;
reset role;

-- Idempotent block creates no second audit action.
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ declare v jsonb; begin
  select public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select player_id from qa_player_lifecycle_config),'otro motivo') into v;
  if v->>'code' <> 'ALREADY_BLOCKED' then raise exception 'QA FAIL: bloqueo no idempotente.'; end if;
end $$;
reset role;

-- Reactivation restores exactly the same player and membership.
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select public.reactivate_club_player_atomic((select club_id from qa_player_lifecycle_config),(select player_id from qa_player_lifecycle_config));
reset role;
do $$ begin
  if not exists(select 1 from public.club_players p join qa_player_lifecycle_config c on c.player_id=p.id where p.operational_status='ACTIVE') then raise exception 'QA FAIL: reactivación no restauró player.'; end if;
  if not exists(select 1 from public.club_memberships m join qa_player_lifecycle_config c on c.club_id=m.club_id and c.player_user_id=m.user_id where m.status='APPROVED') then raise exception 'QA FAIL: reactivación no restauró membership.'; end if;
end $$;

-- Safe leave is logical, preserves the same history and blocks all future entries.
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select public.leave_club_player_safely_atomic((select club_id from qa_player_lifecycle_config),(select player_id from qa_player_lifecycle_config),'QA baja');
reset role;
do $$ begin
  if not exists(select 1 from public.club_players p join qa_player_lifecycle_config c on c.player_id=p.id where p.operational_status='LEFT') then raise exception 'QA FAIL: baja lógica no persistida.'; end if;
  if not exists(select 1 from public.club_memberships m join qa_player_lifecycle_config c on c.club_id=m.club_id and c.player_user_id=m.user_id where m.status='REJECTED') then raise exception 'QA FAIL: baja no cerró acceso.'; end if;
  if not exists(select 1 from public.tournament_teams tt join qa_player_lifecycle_config c on tt.tournament_id=c.tournament_id where tt.player1_user_id=c.player_user_id or tt.player2_user_id=c.player_user_id) then raise exception 'QA FAIL: baja eliminó historia.'; end if;
end $$;

select set_config('request.jwt.claim.sub', player_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin
    perform public.register_team_for_tournament((select tournament_id from qa_player_lifecycle_config),(select club_id from qa_player_lifecycle_config),(select partner_user_id from qa_player_lifecycle_config));
    raise exception 'QA FAIL: jugador dado de baja pudo registrarse.';
  exception when check_violation then
    if position('CLUB_PLAYER_NOT_ELIGIBLE' in sqlerrm)=0 then raise; end if;
  end;
end $$;
reset role;

-- Manual player: no auth/membership is invented, but all three lifecycle states work.
-- An ADMIN may operate a player owned by the club, proving the authorized path.
select set_config('request.jwt.claim.sub', staff_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select manual_player_id from qa_player_lifecycle_config),'QA admin bloqueo');
select public.reactivate_club_player_atomic((select club_id from qa_player_lifecycle_config),(select manual_player_id from qa_player_lifecycle_config));
reset role;
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
select public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select manual_player_id from qa_player_lifecycle_config),'QA manual bloqueo');
select public.reactivate_club_player_atomic((select club_id from qa_player_lifecycle_config),(select manual_player_id from qa_player_lifecycle_config));
select public.leave_club_player_safely_atomic((select club_id from qa_player_lifecycle_config),(select manual_player_id from qa_player_lifecycle_config),'QA manual baja');
reset role;
do $$ begin
  if exists(select 1 from public.club_memberships m join qa_player_lifecycle_config c on m.club_id=c.club_id where m.user_id is null) then raise exception 'QA FAIL: se creó membership manual ficticia.'; end if;
end $$;

-- Security: PLAYER, self, staff and owner are all intentionally protected.
select set_config('request.jwt.claim.sub', partner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin perform public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select staff_player_id from qa_player_lifecycle_config),'x'); raise exception 'QA FAIL: PLAYER pudo bloquear.';
  exception when insufficient_privilege then if position('CLUB_PLAYER_FORBIDDEN' in sqlerrm)=0 then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', staff_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin perform public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select staff_player_id from qa_player_lifecycle_config),'x'); raise exception 'QA FAIL: admin pudo actuar sobre sí mismo.';
  exception when insufficient_privilege then if position('SELF_ACTION_FORBIDDEN' in sqlerrm)=0 then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin perform public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select staff_player_id from qa_player_lifecycle_config),'x'); raise exception 'QA FAIL: staff activo pudo ser bloqueado.';
  exception when check_violation then if position('ACTIVE_STAFF_ROLE' in sqlerrm)=0 then raise; end if; end;
end $$;
reset role;

-- Cross-club identifiers cannot be used to operate on a player from this club.
select set_config('request.jwt.claim.sub', owner_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin perform public.block_club_player_atomic(gen_random_uuid(),(select staff_player_id from qa_player_lifecycle_config),'x'); raise exception 'QA FAIL: cross-club pudo operar un jugador.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', staff_user_id::text, true) from qa_player_lifecycle_config;
set local role authenticated;
do $$ begin
  begin perform public.block_club_player_atomic((select club_id from qa_player_lifecycle_config),(select owner_player_id from qa_player_lifecycle_config),'x'); raise exception 'QA FAIL: OWNER pudo ser bloqueado sin transferencia.';
  exception when check_violation then if position('OWNER_TRANSFER_REQUIRED' in sqlerrm)=0 then raise; end if; end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.club_team_audit a join qa_player_lifecycle_config c on a.club_id=c.club_id where a.action in ('PLAYER_BLOCKED','PLAYER_REACTIVATED','PLAYER_LEFT')) < 4 then
    raise exception 'QA FAIL: faltan auditorías de lifecycle.';
  end if;
end $$;

rollback;
