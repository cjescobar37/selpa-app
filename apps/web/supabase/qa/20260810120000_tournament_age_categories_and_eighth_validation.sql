begin;

create or replace function pg_temp.run_tournament_age_qa()
returns text language plpgsql as $$
declare
  v_club_a uuid;
  v_club_b uuid;
  v_owner uuid;
  v_sub16 uuid;
  v_plus45 uuid;
  v_inactive uuid;
  v_cross uuid;
  v_eighth uuid;
  v_legacy_age uuid;
  v_legacy_sum uuid;
  v_legacy_note text := '';
begin
  select membership.club_id, membership.user_id into v_club_a, v_owner
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at
  limit 1;

  select club.id into v_club_b
  from public.clubs club
  where club.id <> v_club_a
  order by club.created_at
  limit 1;

  if v_club_a is null or v_club_b is null then
    return 'FAIL | QA no ejecutable: se requieren dos clubes y un OWNER aprobado';
  end if;

  insert into public.competition_age_categories(
    club_id,name,code,min_age,max_age,age_reference_rule,sort_order,is_active,created_by
  ) values
    (v_club_a,'QA Sub 16','QA_SUB16_'||substr(gen_random_uuid()::text,1,8),null,15,'CALENDAR_YEAR_END',900,true,v_owner),
    (v_club_a,'QA +45','QA_PLUS45_'||substr(gen_random_uuid()::text,1,8),45,null,'CALENDAR_YEAR_END',901,true,v_owner),
    (v_club_a,'QA Inactiva','QA_INACTIVE_'||substr(gen_random_uuid()::text,1,8),null,15,'CALENDAR_YEAR_END',902,false,v_owner);

  select category.id into v_sub16
  from public.competition_age_categories category
  where category.club_id = v_club_a and category.name = 'QA Sub 16'
  order by category.created_at desc limit 1;

  select category.id into v_plus45
  from public.competition_age_categories category
  where category.club_id = v_club_a and category.name = 'QA +45'
  order by category.created_at desc limit 1;

  select category.id into v_inactive
  from public.competition_age_categories category
  where category.club_id = v_club_a and category.name = 'QA Inactiva'
  order by category.created_at desc limit 1;

  insert into public.competition_age_categories(
    club_id,name,code,min_age,max_age,age_reference_rule,sort_order,is_active,created_by
  ) values (
    v_club_b,'QA Cross','QA_CROSS_'||substr(gen_random_uuid()::text,1,8),null,15,
    'CALENDAR_YEAR_END',900,true,v_owner
  ) returning id into v_cross;

  if not exists (
    select 1 from public.categories category
    where category.id = 8 and lower(btrim(category.name)) = '8va'
  ) then
    raise exception '8va no existe con su ID canónico';
  end if;

  -- Libres 8va canónica.
  insert into public.tournaments(
    club_id,name,type,format,gender,segment,category_id,category,category_rule,
    fixed_category_id,category_sum_target,age_category_id,start_date,status
  ) values (
    v_club_a,'QA 8va','OPEN','GROUPS_ELIMINATION','MALE','LIBRES',8,8,
    'FIXED_CATEGORY',8,null,null,current_date,'DRAFT'
  ) returning id into v_eighth;

  -- Suma XX reproduce el payload actual: category_id/category visibles,
  -- fixed_category_id NULL y target explícito.
  insert into public.tournaments(
    club_id,name,type,format,gender,segment,category_id,category,category_rule,
    fixed_category_id,category_sum_target,age_category_id,start_date,status
  ) values (
    v_club_a,'QA Suma 16','OPEN','GROUPS_ELIMINATION','MIXED','LIBRES',7,7,
    'CATEGORY_SUM',null,16,null,current_date,'DRAFT'
  );

  -- Menores y Veteranos válidos.
  insert into public.tournaments(
    club_id,name,type,format,gender,segment,category_id,category,category_rule,
    fixed_category_id,category_sum_target,age_category_id,start_date,status
  ) values
    (v_club_a,'QA Sub 16','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,'FIXED_CATEGORY',null,null,v_sub16,current_date,'DRAFT'),
    (v_club_a,'QA +45','OPEN','GROUPS_ELIMINATION','MALE','VETERANOS',null,null,'FIXED_CATEGORY',null,null,v_plus45,current_date,'DRAFT');

  -- Solo se ejercita compatibilidad sobre filas históricas reales. La QA no usa
  -- bypass de triggers, constraints ni privilegios de superusuario.
  select tournament.id into v_legacy_sum
  from public.tournaments tournament
  where tournament.club_id = v_club_a
    and tournament.segment = 'LIBRES'
    and tournament.category_rule = 'CATEGORY_SUM'
    and tournament.fixed_category_id is not null
  order by tournament.created_at
  limit 1;

  if v_legacy_sum is not null then
    update public.tournaments tournament
    set name = tournament.name || ' [QA legacy]'
    where tournament.id = v_legacy_sum;
  else
    v_legacy_note := ' | legacy Suma no ejercitado: no existe candidato real';
  end if;

  select tournament.id into v_legacy_age
  from public.tournaments tournament
  where tournament.club_id = v_club_a
    and tournament.segment in ('MENORES', 'VETERANOS')
    and tournament.age_category_id is null
  order by tournament.created_at
  limit 1;

  if v_legacy_age is not null then
    update public.tournaments tournament
    set name = tournament.name || ' [QA legacy]'
    where tournament.id = v_legacy_age;
  else
    v_legacy_note := v_legacy_note || ' | legacy etario no ejercitado: no existe candidato real';
  end if;

  -- Cross-club.
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Cross inválido','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,
      'FIXED_CATEGORY',null,null,v_cross,current_date,'DRAFT'
    );
    raise exception 'cross-club permitido';
  exception when foreign_key_violation then null;
  end;

  -- Categoría inactiva.
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Inactiva inválida','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,
      'FIXED_CATEGORY',null,null,v_inactive,current_date,'DRAFT'
    );
    raise exception 'categoría inactiva permitida';
  exception when check_violation then null;
  end;

  -- Combinaciones etarias incorrectas.
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Menores +45 inválido','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,
      'FIXED_CATEGORY',null,null,v_plus45,current_date,'DRAFT'
    );
    raise exception 'MENORES aceptó +45';
  exception when check_violation then null;
  end;
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Veteranos Sub16 inválido','OPEN','GROUPS_ELIMINATION','MALE','VETERANOS',null,null,
      'FIXED_CATEGORY',null,null,v_sub16,current_date,'DRAFT'
    );
    raise exception 'VETERANOS aceptó Sub16';
  exception when check_violation then null;
  end;

  -- Nuevas altas inconsistentes.
  begin
    update public.tournaments tournament set age_category_id = v_sub16 where tournament.id = v_eighth;
    raise exception 'LIBRES con categoría etaria permitido';
  exception when check_violation then null;
  end;
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Menores sin edad','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,
      'FIXED_CATEGORY',null,null,null,current_date,'DRAFT'
    );
    raise exception 'MENORES sin categoría etaria permitido';
  exception when check_violation then null;
  end;
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Suma no canónica','OPEN','GROUPS_ELIMINATION','MIXED','LIBRES',7,7,
      'CATEGORY_SUM',7,13,null,current_date,'DRAFT'
    );
    raise exception 'alta Suma legacy permitida';
  exception when check_violation then null;
  end;
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Menores Suma inválida','OPEN','GROUPS_ELIMINATION','FEMALE','MENORES',null,null,
      'CATEGORY_SUM',null,13,v_sub16,current_date,'DRAFT'
    );
    raise exception 'MENORES aceptó CATEGORY_SUM';
  exception when check_violation then null;
  end;
  begin
    insert into public.tournaments(
      club_id,name,type,format,gender,segment,category_id,category,category_rule,
      fixed_category_id,category_sum_target,age_category_id,start_date,status
    ) values (
      v_club_a,'QA Veteranos Suma inválida','OPEN','GROUPS_ELIMINATION','MALE','VETERANOS',null,null,
      'CATEGORY_SUM',null,13,v_plus45,current_date,'DRAFT'
    );
    raise exception 'VETERANOS aceptó CATEGORY_SUM';
  exception when check_violation then null;
  end;

  -- Un legacy incompleto no puede cambiar scope deportivo sin normalizarse.
  if v_legacy_age is not null then
    begin
      update public.tournaments tournament
      set segment = case when tournament.segment = 'MENORES' then 'VETERANOS' else 'MENORES' end
      where tournament.id = v_legacy_age;
      raise exception 'legacy cambió scope sin categoría etaria';
    exception when check_violation then null;
    end;
  end if;

  return 'PASS | 8va, Suma canónico, categorías etarias, tenant scope y nuevas altas válidos' || v_legacy_note;
exception when others then return 'FAIL | '||sqlerrm;
end;
$$;

select pg_temp.run_tournament_age_qa() as result;
rollback;
