begin;

create or replace function pg_temp.run_points_schemes_stage5a7_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_club uuid; v_other_club uuid; v_owner uuid; v_admin uuid; v_operator uuid; v_plan uuid; v_player uuid;
  v_scheme public.points_schemes; v_clone public.points_schemes; v_rule public.points_scheme_rules;
  v_revision integer; v_count integer; v_step text:='fixtures';
begin
  select membership.club_id,
    (array_agg(membership.user_id order by membership.user_id) filter(where membership.role='OWNER'))[1],
    (array_agg(membership.user_id order by membership.user_id) filter(where membership.role='ADMIN'))[1],
    (array_agg(membership.user_id order by membership.user_id) filter(where membership.role='OPERADOR'))[1],
    (array_agg(membership.user_id order by membership.user_id) filter(where membership.role='PLANILLERO'))[1],
    (array_agg(membership.user_id order by membership.user_id) filter(where membership.role='PLAYER'))[1]
  into v_club,v_owner,v_admin,v_operator,v_plan,v_player
  from public.club_memberships membership
  where membership.status='APPROVED' and membership.approved_at is not null
  group by membership.club_id
  having count(*) filter(where membership.role='OWNER')>0
  order by membership.club_id limit 1;
  select club.id into v_other_club from public.clubs club where club.id<>v_club order by club.id limit 1;
  if v_club is null or v_owner is null or v_other_club is null then return query select 'FAIL','QA no ejecutable: se requieren un OWNER aprobado y dos clubes';return;end if;

  v_step:='owner context';
  perform set_config('request.jwt.claim.sub',v_owner::text,true);perform set_config('request.jwt.claim.role','authenticated',true);set local role authenticated;
  if auth.uid() is distinct from v_owner then raise exception 'AUTH_CONTEXT_INVALID';end if;
  if not public.has_club_capability(v_club,'competition:manage') then raise exception 'OWNER_WITHOUT_COMPETITION_MANAGE';end if;
  v_step:='create scheme';
  v_scheme:=public.create_points_scheme(v_club,'  QA Stage 5A.7  ','Esquema transaccional');
  if v_scheme.name<>'QA Stage 5A.7' or v_scheme.is_active or v_scheme.revision<>1 or v_scheme.is_global then raise exception 'CREATE_INVALID';end if;
  begin perform public.create_points_scheme(v_club,'QA Stage 5A.7',null);raise exception 'DUPLICATE_ALLOWED';exception when unique_violation then null;end;
  begin update public.points_schemes set description='DML directo' where id=v_scheme.id;raise exception 'DIRECT_DML_ALLOWED';exception when insufficient_privilege then null;end;
  v_step:='add rule';v_rule:=public.add_points_scheme_rule(v_club,v_scheme.id,v_scheme.revision,'CHAMPION',100,0);
  select * into v_scheme from public.points_schemes where id=v_scheme.id;
  if v_scheme.revision<>2 then raise exception 'RULE_REVISION_INVALID';end if;
  begin perform public.add_points_scheme_rule(v_club,v_scheme.id,v_scheme.revision,'CHAMPION',90,1);raise exception 'RULE_DUPLICATE_ALLOWED';exception when unique_violation then null;end;
  begin perform public.add_points_scheme_rule(v_club,v_scheme.id,v_scheme.revision,'BONUS',10,2);raise exception 'UNKNOWN_RULE_ALLOWED';exception when sqlstate '22023' then null;end;
  v_rule:=public.update_points_scheme_rule(v_club,v_scheme.id,v_rule.id,v_scheme.revision,v_rule.revision,100,0,true);
  select revision into v_revision from public.points_schemes where id=v_scheme.id;
  if v_revision<>v_scheme.revision then raise exception 'NOOP_INCREMENTED_REVISION';end if;
  begin perform public.update_points_scheme(v_club,v_scheme.id,1,'Otro',null);raise exception 'STALE_ALLOWED';exception when serialization_failure then null;end;
  select * into v_scheme from public.points_schemes where id=v_scheme.id;
  v_step:='activate scheme';v_scheme:=public.set_points_scheme_active(v_club,v_scheme.id,v_scheme.revision,true);
  if not v_scheme.is_active then raise exception 'ACTIVATION_FAILED';end if;
  v_scheme:=public.set_points_scheme_active(v_club,v_scheme.id,v_scheme.revision,true);
  v_step:='clone scheme';v_clone:=public.clone_points_scheme(v_club,v_scheme.id,'QA Stage 5A.7 copia');
  select count(*) into v_count from public.points_scheme_rules rule where rule.scheme_id=v_clone.id and rule.rule_key='CHAMPION';
  if v_count<>1 or v_clone.is_active then raise exception 'CLONE_INVALID';end if;
  v_step:='cross-club isolation';
  begin
    perform public.update_points_scheme(v_other_club,v_scheme.id,v_scheme.revision,'Cross club',null);
    raise exception 'CROSS_CLUB_ALLOWED';
  exception
    when insufficient_privilege or no_data_found then null;
  end;

  reset role;
  if v_operator is not null then
    v_step:='operator permissions';
    perform set_config('request.jwt.claim.sub',v_operator::text,true);set local role authenticated;
    perform public.create_points_scheme(v_club,'QA Operador',null);
    begin perform public.set_points_scheme_active(v_club,v_clone.id,v_clone.revision,true);raise exception 'OPERATOR_ACTIVATED';exception when insufficient_privilege then null;end;reset role;
  end if;
  v_step:='planillero permissions';if v_plan is not null then perform set_config('request.jwt.claim.sub',v_plan::text,true);set local role authenticated;begin perform public.create_points_scheme(v_club,'QA Planillero',null);raise exception 'PLAN_WRITE_ALLOWED';exception when insufficient_privilege then null;end;reset role;end if;
  v_step:='player permissions';if v_player is not null then perform set_config('request.jwt.claim.sub',v_player::text,true);set local role authenticated;begin perform public.create_points_scheme(v_club,'QA Player',null);raise exception 'PLAYER_WRITE_ALLOWED';exception when insufficient_privilege then null;end;reset role;end if;

  v_step:='anon permissions';set local role anon;perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
  begin perform public.create_points_scheme(v_club,'QA Anon',null);raise exception 'ANON_WRITE_ALLOWED';exception when insufficient_privilege then null;end;reset role;

  return query select 'PASS','Stage 5A.7 válido: creación, normalización, duplicados, reglas compatibles, revisión/no-op/stale, activación, clonación, tenant scope, roles y rollback';
exception when others then reset role;return query select 'FAIL',v_step||' | '||sqlstate||' | '||sqlerrm;
end;$$;

select qa_status||' | '||qa_detail as result from pg_temp.run_points_schemes_stage5a7_qa();
rollback;
