-- QA transaccional — CLUB Equipo y Roles, Etapa 2B.
-- Ejecutar completo después de 20260724_club_roles_stage2b_atomic_members.sql.

begin;

create or replace function pg_temp.expect_stage2b_error(p_sql text,p_code text)
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

create or replace function pg_temp.fail_stage2b_audit()
returns trigger language plpgsql as $$
begin
  if new.action=current_setting('qa.stage2b_fail_action',true) then
    raise exception 'QA forced audit failure';
  end if;
  return new;
end;
$$;

create or replace function pg_temp.run_club_roles_stage2b_qa()
returns table(qa_status text,qa_detail text)
language plpgsql as $qa$
declare
  v_club uuid; v_club_b uuid; v_owner uuid; v_owner_m uuid;
  v_admin uuid; v_admin_m uuid; v_operator uuid; v_operator_m uuid;
  v_plan uuid; v_plan_m uuid; v_player uuid; v_player_m uuid;
  v_candidate uuid; v_cross_m uuid; v_removed_m uuid; v_role text;
  v_used uuid[]; v_before jsonb; v_after jsonb; v_old_allow text; v_old_context text;
  v_function text; v_count integer;
begin
  select membership.club_id,membership.user_id,membership.id
    into v_club,v_owner,v_owner_m
  from public.club_memberships membership
  where membership.role='OWNER' and membership.status='APPROVED' and membership.approved_at is not null
  order by membership.created_at limit 1;
  if v_club is null then return query select 'FAIL','QA no ejecutable: falta OWNER APPROVED'; return; end if;

  insert into public.clubs as club(name,slug)
  values('QA Etapa 2B Club B','qa-etapa-2b-'||txid_current()) returning club.id into v_club_b;
  v_used:=array[v_owner];
  foreach v_role in array array['ADMIN','OPERADOR','PLANILLERO','PLAYER'] loop
    select users.id into v_candidate from auth.users users
    where users.email is not null and not(users.id=any(v_used))
      and not exists(select 1 from public.club_memberships membership
        where membership.club_id=v_club and membership.user_id=users.id)
    order by users.created_at limit 1;
    if v_candidate is null then
      return query select 'FAIL','QA no ejecutable: faltan usuarios para autoaprovisionar roles'; return;
    end if;
    insert into public.club_memberships as membership(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club,v_candidate,v_role::public.club_role,'APPROVED',now(),v_owner)
    returning membership.id into v_removed_m;
    if v_role='ADMIN' then v_admin:=v_candidate;v_admin_m:=v_removed_m;
    elsif v_role='OPERADOR' then v_operator:=v_candidate;v_operator_m:=v_removed_m;
    elsif v_role='PLANILLERO' then v_plan:=v_candidate;v_plan_m:=v_removed_m;
    else v_player:=v_candidate;v_player_m:=v_removed_m; end if;
    v_used:=array_append(v_used,v_candidate);
  end loop;

  insert into public.club_memberships as membership(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club_b,v_player,'ADMIN','APPROVED',now(),v_owner) returning membership.id into v_cross_m;
  insert into public.club_players(club_id,user_id,display_name,category,gender,approved_at,approved_by)
  values(v_club,v_plan,'QA 2B preservado',null,null,now(),v_owner)
  on conflict(club_id,user_id) do update set display_name='QA 2B preservado';
  select to_jsonb(player) into v_before from public.club_players player
  where player.club_id=v_club and player.user_id=v_plan;

  -- CAMBIO DE ROL 1-4.
  perform public.change_club_staff_role_atomic(v_club,v_admin_m,'OPERADOR',v_owner);
  perform public.change_club_staff_role_atomic(v_club,v_admin_m,'PLANILLERO',v_owner);
  perform public.change_club_staff_role_atomic(v_club,v_admin_m,'PLAYER',v_owner);
  update public.club_memberships as membership set role='ADMIN' where membership.id=v_admin_m;
  perform public.change_club_staff_role_atomic(v_club,v_plan_m,'OPERADOR',v_admin);
  update public.club_memberships as membership set role='PLANILLERO' where membership.id=v_plan_m;

  -- 5-7 roles sin permiso.
  foreach v_candidate in array array[v_operator,v_plan,v_player] loop
    perform pg_temp.expect_stage2b_error(format(
      'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
      v_club,v_admin_m,'OPERADOR',v_candidate),'forbidden');
  end loop;
  -- 8-12 OWNER común, OWNER target, self, redundancia y cross-club.
  perform pg_temp.expect_stage2b_error(format(
    'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_plan_m,'OWNER',v_owner),'cannot_assign_owner');
  perform pg_temp.expect_stage2b_error(format(
    'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_owner_m,'ADMIN',v_admin),'owner_role_protected');
  perform pg_temp.expect_stage2b_error(format(
    'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_admin_m,'OPERADOR',v_admin),'cannot_modify_self');
  perform pg_temp.expect_stage2b_error(format(
    'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_plan_m,'PLANILLERO',v_owner),'role_unchanged');
  perform pg_temp.expect_stage2b_error(format(
    'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
    v_club,v_cross_m,'OPERADOR',v_owner),'cross_club_forbidden');

  -- 13-15 estados no aprobados.
  foreach v_role in array array['PENDING','REJECTED','BANNED'] loop
    update public.club_memberships as membership
    set status=v_role::public.membership_status,approved_at=null where membership.id=v_player_m;
    perform pg_temp.expect_stage2b_error(format(
      'select public.change_club_staff_role_atomic(%L,%L,%L::public.club_role,%L)',
      v_club,v_player_m,'OPERADOR',v_owner),'membership_not_approved');
  end loop;
  update public.club_memberships as membership
  set status='APPROVED',approved_at=now(),role='PLAYER' where membership.id=v_player_m;

  -- 16 y 18 auditoría y club_players.
  perform public.change_club_staff_role_atomic(v_club,v_plan_m,'OPERADOR',v_owner);
  if not exists(select 1 from public.club_team_audit audit
    where audit.membership_id=v_plan_m and audit.action='ROLE_CHANGED'
      and audit.metadata->>'previous_role'='PLANILLERO') then raise exception 'Falta auditoría ROLE_CHANGED'; end if;
  select to_jsonb(player) into v_after from public.club_players player
  where player.club_id=v_club and player.user_id=v_plan;
  if v_after is distinct from v_before then raise exception 'Cambio de rol modificó club_players'; end if;
  update public.club_memberships as membership set role='PLANILLERO' where membership.id=v_plan_m;

  -- 17 rollback ante auditoría.
  create trigger qa_stage2b_audit_failure before insert on public.club_team_audit
  for each row execute function pg_temp.fail_stage2b_audit();
  perform set_config('qa.stage2b_fail_action','ROLE_CHANGED',true);
  begin perform public.change_club_staff_role_atomic(v_club,v_plan_m,'OPERADOR',v_owner);
  exception when others then null; end;
  if exists(select 1 from public.club_memberships membership
    where membership.id=v_plan_m and membership.role='OPERADOR') then raise exception 'ROLE_CHANGED parcial'; end if;

  -- REMOCIÓN 19 y 30-33: OWNER, auditoría, active club y preservación.
  perform set_config('qa.stage2b_fail_action','',true);
  insert into public.user_settings(user_id,active_club_id) values(v_plan,v_club)
  on conflict(user_id) do update set active_club_id=excluded.active_club_id;
  v_removed_m:=v_plan_m;
  perform public.remove_club_staff_atomic(v_club,v_plan_m,v_owner);
  if exists(select 1 from public.club_memberships membership where membership.id=v_plan_m) then raise exception 'OWNER no removió'; end if;
  if not exists(select 1 from public.club_team_audit audit where audit.membership_id=v_removed_m and audit.action='MEMBER_REMOVED') then raise exception 'Falta auditoría MEMBER_REMOVED'; end if;
  if exists(select 1 from public.user_settings settings where settings.user_id=v_plan and settings.active_club_id=v_club) then raise exception 'active_club_id no reparado'; end if;
  select to_jsonb(player) into v_after from public.club_players player where player.club_id=v_club and player.user_id=v_plan;
  if v_after is distinct from v_before then raise exception 'Remoción modificó club_players'; end if;
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_removed_m,v_owner),'member_not_found');
  insert into public.club_memberships as membership(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club,v_plan,'PLANILLERO','APPROVED',now(),v_owner) returning membership.id into v_plan_m;

  -- 20 ADMIN remueve y se repone.
  perform public.remove_club_staff_atomic(v_club,v_player_m,v_admin);
  insert into public.club_memberships as membership(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club,v_player,'PLAYER','APPROVED',now(),v_owner) returning membership.id into v_player_m;

  -- 21-27 permisos, owner, self y cross-club.
  foreach v_candidate in array array[v_operator,v_plan,v_player] loop
    perform pg_temp.expect_stage2b_error(format(
      'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_admin_m,v_candidate),'forbidden');
  end loop;
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_owner_m,v_admin),'cannot_remove_owner');
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_owner_m,v_owner),'cannot_remove_owner');
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_admin_m,v_admin),'cannot_modify_self');
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_cross_m,v_owner),'cross_club_forbidden');
  -- 29 no aprobado.
  update public.club_memberships as membership set status='PENDING',approved_at=null where membership.id=v_player_m;
  perform pg_temp.expect_stage2b_error(format(
    'select public.remove_club_staff_atomic(%L,%L,%L)',v_club,v_player_m,v_owner),'membership_not_approved');
  update public.club_memberships as membership set status='APPROVED',approved_at=now() where membership.id=v_player_m;
  -- 31 rollback auditoría.
  perform set_config('qa.stage2b_fail_action','MEMBER_REMOVED',true);
  begin perform public.remove_club_staff_atomic(v_club,v_plan_m,v_owner); exception when others then null; end;
  if not exists(select 1 from public.club_memberships membership where membership.id=v_plan_m) then raise exception 'MEMBER_REMOVED parcial'; end if;

  -- OWNERSHIP 34 y 44-46: ADMIN y restauración.
  perform set_config('qa.stage2b_fail_action','',true);
  v_old_allow:=current_setting('selpa.allow_owner_transfer',true);
  v_old_context:=current_setting('selpa.owner_transfer_context',true);
  perform public.transfer_club_ownership_atomic(v_club,v_admin_m,v_owner);
  if not exists(select 1 from public.club_memberships membership where membership.id=v_owner_m and membership.role='ADMIN')
    or not exists(select 1 from public.club_memberships membership where membership.id=v_admin_m and membership.role='OWNER') then raise exception 'Transferencia a ADMIN incorrecta'; end if;
  select count(*) into v_count from public.club_memberships membership
  where membership.club_id=v_club and membership.role='OWNER' and membership.status='APPROVED' and membership.approved_at is not null;
  if v_count<>1 then raise exception 'Transferencia no dejó exactamente un OWNER'; end if;
  perform public.transfer_club_ownership_atomic(v_club,v_owner_m,v_admin);

  -- 35 transferencia a OPERADOR y vuelta.
  perform public.transfer_club_ownership_atomic(v_club,v_operator_m,v_owner);
  if not exists(select 1 from public.club_memberships membership where membership.id=v_operator_m and membership.role='OWNER') then raise exception 'Transferencia a OPERADOR falló'; end if;
  perform public.transfer_club_ownership_atomic(v_club,v_owner_m,v_operator);
  update public.club_memberships as membership set role='OPERADOR' where membership.id=v_operator_m;

  -- 36-43 destinos inválidos, estados, cross, self y ADMIN actor.
  foreach v_candidate in array array[v_plan_m,v_player_m] loop
    perform pg_temp.expect_stage2b_error(format(
      'select public.transfer_club_ownership_atomic(%L,%L,%L)',v_club,v_candidate,v_owner),'ownership_target_role_invalid');
  end loop;
  foreach v_role in array array['PENDING','REJECTED','BANNED'] loop
    update public.club_memberships as membership set status=v_role::public.membership_status,approved_at=null where membership.id=v_admin_m;
    perform pg_temp.expect_stage2b_error(format(
      'select public.transfer_club_ownership_atomic(%L,%L,%L)',v_club,v_admin_m,v_owner),'ownership_target_not_approved');
  end loop;
  update public.club_memberships as membership set status='APPROVED',approved_at=now(),role='ADMIN' where membership.id=v_admin_m;
  perform pg_temp.expect_stage2b_error(format(
    'select public.transfer_club_ownership_atomic(%L,%L,%L)',v_club,v_cross_m,v_owner),'cross_club_forbidden');
  perform pg_temp.expect_stage2b_error(format(
    'select public.transfer_club_ownership_atomic(%L,%L,%L)',v_club,v_owner_m,v_owner),'ownership_same_user');
  perform pg_temp.expect_stage2b_error(format(
    'select public.transfer_club_ownership_atomic(%L,%L,%L)',v_club,v_operator_m,v_admin),'forbidden');

  -- 47 índice rechaza segundo OWNER.
  begin
    delete from public.club_memberships as membership where membership.id=v_plan_m;
    insert into public.club_memberships(club_id,user_id,role,status,approved_at,approved_by)
    values(v_club,v_plan,'OWNER','APPROVED',now(),v_owner);
    raise exception 'Índice permitió segundo OWNER';
  exception when unique_violation then null; end;
  insert into public.club_memberships as membership(club_id,user_id,role,status,approved_at,approved_by)
  values(v_club,v_plan,'PLANILLERO','APPROVED',now(),v_owner)
  on conflict(club_id,user_id) do update set role='PLANILLERO',status='APPROVED',approved_at=now()
  returning membership.id into v_plan_m;

  -- 48-49 protección directa.
  begin update public.club_memberships as membership set role='ADMIN' where membership.id=v_owner_m;
    raise exception 'UPDATE directo degradó OWNER'; exception when others then
    if sqlerrm='UPDATE directo degradó OWNER' then raise; end if; end;
  begin delete from public.club_memberships as membership where membership.id=v_owner_m;
    raise exception 'DELETE directo eliminó OWNER'; exception when others then
    if sqlerrm='DELETE directo eliminó OWNER' then raise; end if; end;

  -- 50 auditoría ownership.
  if not exists(select 1 from public.club_team_audit audit
    where audit.club_id=v_club and audit.action='OWNERSHIP_TRANSFERRED'
      and audit.metadata ? 'new_owner_membership_id') then raise exception 'Falta auditoría ownership'; end if;

  -- 51-53 rollback y restauración GUC.
  perform set_config('qa.stage2b_fail_action','OWNERSHIP_TRANSFERRED',true);
  begin perform public.transfer_club_ownership_atomic(v_club,v_admin_m,v_owner); exception when others then null; end;
  if not exists(select 1 from public.club_memberships membership where membership.id=v_owner_m and membership.role='OWNER')
    or not exists(select 1 from public.club_memberships membership where membership.id=v_admin_m and membership.role='ADMIN') then raise exception 'Ownership parcial tras auditoría'; end if;
  if current_setting('selpa.allow_owner_transfer',true) is distinct from coalesce(v_old_allow,'')
    or current_setting('selpa.owner_transfer_context',true) is distinct from coalesce(v_old_context,'') then raise exception 'GUC no restaurado tras error'; end if;
  perform set_config('qa.stage2b_fail_action','',true);
  perform public.transfer_club_ownership_atomic(v_club,v_admin_m,v_owner);
  if current_setting('selpa.allow_owner_transfer',true) is distinct from coalesce(v_old_allow,'')
    or current_setting('selpa.owner_transfer_context',true) is distinct from coalesce(v_old_context,'') then raise exception 'GUC no restaurado tras éxito'; end if;
  perform public.transfer_club_ownership_atomic(v_club,v_owner_m,v_admin);

  -- 54 club_players intacto tras toda la secuencia.
  select to_jsonb(player) into v_after from public.club_players player
  where player.club_id=v_club and player.user_id=v_plan;
  if v_after is distinct from v_before then raise exception 'Ownership/remoción modificó club_players'; end if;
  drop trigger qa_stage2b_audit_failure on public.club_team_audit;

  -- 55-59 seguridad de RPC.
  foreach v_function in array array[
    'change_club_staff_role_atomic','remove_club_staff_atomic','transfer_club_ownership_atomic'
  ] loop
    if not exists(select 1 from pg_catalog.pg_proc proc
      where proc.pronamespace='public'::regnamespace and proc.proname=v_function
        and proc.prosecdef and 'search_path=pg_catalog, public, auth'=any(proc.proconfig)
        and has_function_privilege('service_role',proc.oid,'EXECUTE')
        and not has_function_privilege('authenticated',proc.oid,'EXECUTE')
        and not has_function_privilege('anon',proc.oid,'EXECUTE')) then
      raise exception 'Seguridad/grants incorrectos en %',v_function;
    end if;
  end loop;
  -- 60 policies sin bypass UPDATE/DELETE.
  if exists(select 1 from pg_catalog.pg_policies policy
    where policy.schemaname='public' and policy.tablename='club_memberships'
      and policy.cmd in ('UPDATE','DELETE') and ('authenticated'=any(policy.roles) or 'public'=any(policy.roles))) then
    raise exception 'Policy authenticated permite bypass de mutaciones';
  end if;
  -- 61 índice parcial válido.
  if not exists(select 1 from pg_catalog.pg_indexes index_def
    where index_def.schemaname='public' and index_def.tablename='club_memberships'
      and index_def.indexname='idx_club_memberships_single_approved_owner'
      and index_def.indexdef ilike '%unique%' and index_def.indexdef ilike '%role = ''OWNER''%') then
    raise exception 'Índice único parcial de OWNER ausente o inválido';
  end if;

  return query select 'PASS','Etapa 2B válida: roles, remoción y transferencia de ownership';
exception when others then return query select 'FAIL',sqlerrm;
end;
$qa$;

select qa.qa_status||' | '||qa.qa_detail as result from pg_temp.run_club_roles_stage2b_qa() qa;
rollback;
