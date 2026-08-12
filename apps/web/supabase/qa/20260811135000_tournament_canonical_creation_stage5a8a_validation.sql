begin;

create or replace function pg_temp.run_tournament_canonical_stage5a8a_qa()
returns table(qa_status text,qa_detail text) language plpgsql as $$
declare actor uuid; club uuid; sub16 uuid; plus45 uuid; t public.tournaments%rowtype; failed boolean; expected_keys text[]:=array[
  'wo_tolerance_minutes','wo_score','segment_type','public_description','prizes','competition_system','venue_name','tournament_courts','schedule_config','points_config',
  'flyer_mode','flyer_background','flyer_title_color','flyer_text_color','flyer_accent_color','flyer_badge_color','flyer_date_block_color','flyer_data_card_color',
  'flyer_data_card_opacity','flyer_data_card_radius','flyer_data_style','flyer_title_size','flyer_visible_fields','flyer_font','flyer_font_weight','flyer_style','flyer_text_align'];
  base jsonb; expected jsonb; fallback jsonb; variant jsonb;
begin
  if to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null then return query select 'FAIL','QA no ejecutable: falta Stage 5A.8A'; return; end if;
  select m.user_id,m.club_id into actor,club from public.club_memberships m where m.role='OWNER' and m.status='APPROVED' and m.approved_at is not null order by m.created_at limit 1;
  if actor is null then return query select 'FAIL','QA no ejecutable: falta OWNER aprobado'; return; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  -- Reuse a real compatible category when present. Otherwise create an isolated
  -- QA category inside this transaction; ROLLBACK guarantees no catalog changes.
  select c.id into sub16
  from public.competition_age_categories c
  where c.club_id=club and c.is_active
    and lower(btrim(c.code))='sub16'
    and c.min_age is null and c.max_age is not null and c.max_age <= 18
    and c.age_reference_rule in ('EVENT_START_DATE','CALENDAR_YEAR_END','FIXED_DATE')
  order by c.max_age desc,c.sort_order,c.id
  limit 1;
  if sub16 is null then
    insert into public.competition_age_categories(
      club_id,name,code,min_age,max_age,age_reference_rule,age_reference_config,sort_order,is_active,created_by
    ) values (
      club,'QA Sub16','QA5A8A_SUB16_'||replace(gen_random_uuid()::text,'-',''),null,15,
      'CALENDAR_YEAR_END','{}'::jsonb,999991,true,actor
    ) returning id into sub16;
  end if;
  select c.id into plus45
  from public.competition_age_categories c
  where c.club_id=club and c.is_active
    and lower(btrim(c.code))='plus45'
    and c.min_age is not null and c.min_age >= 45
    and c.age_reference_rule in ('EVENT_START_DATE','CALENDAR_YEAR_END','FIXED_DATE')
  order by c.min_age,c.sort_order,c.id
  limit 1;
  if plus45 is null then
    insert into public.competition_age_categories(
      club_id,name,code,min_age,max_age,age_reference_rule,age_reference_config,sort_order,is_active,created_by
    ) values (
      club,'QA +45','QA5A8A_PLUS45_'||replace(gen_random_uuid()::text,'-',''),45,null,
      'CALENDAR_YEAR_END','{}'::jsonb,999992,true,actor
    ) returning id into plus45;
  end if;
  base:=jsonb_build_object('name','QA Canonical','type','OPEN','gender','MALE','segment','LIBRES','category_id',8,'category_rule','FIXED_CATEGORY',
    'start_date',(current_date+1)::text,'end_date',(current_date+2)::text,'min_pairs',2,'max_pairs',8,'price_per_player',0,
    'public_description','QA','prizes',jsonb_build_object('enabled',true,'champion','Trofeo','runner_up','Premio'),
    'competition_system','GROUPS_PLAYOFF','venue_name','Sede QA','tournament_courts',jsonb_build_array(jsonb_build_object('name','Cancha 1','source','OWN_CLUB')),
    'schedule_config',jsonb_build_object('mode','AUTO','match_duration_minutes',90,'groups',jsonb_build_object('date',(current_date+1)::text,'start_time','10:00','end_time','22:00'),
      'playoff',jsonb_build_object('date',(current_date+2)::text,'start_time','10:00','end_time','22:00')),
    'points_config',jsonb_build_object('enabled',false,'editable',false),'group_tiebreakers',jsonb_build_object('order',jsonb_build_array('POINTS','HEAD_TO_HEAD','SET_DIFF','GAME_DIFF'),'final','SEED'),
    'flyer',jsonb_build_object('flyer_mode','AUTO','flyer_background','fondo1','flyer_visible_fields',jsonb_build_object('date',true)));
  expected:=jsonb_build_object(
    'wo_tolerance_minutes',10,'wo_score','6-0 6-0','segment_type','LIBRES','public_description','QA',
    'prizes',jsonb_build_object('enabled',true,'champion','Trofeo','runner_up','Premio'),'competition_system','GROUPS_PLAYOFF','venue_name','Sede QA',
    'tournament_courts',jsonb_build_array(jsonb_build_object('name','Cancha 1','complex_name',null,'source','OWN_CLUB')),
    'schedule_config',jsonb_build_object('mode','AUTO','match_duration_minutes',90,
      'groups',jsonb_build_object('date',(current_date+1)::text,'start_time','10:00','end_time','22:00'),
      'playoff',jsonb_build_object('date',(current_date+2)::text,'start_time','10:00','end_time','22:00')),
    'points_config',jsonb_build_object('enabled',false,'editable',false,'winner',0,'finalist',0,'semifinalist',0,'quarterfinalist',0,'eighthFinalist',0,'participation',0),
    'group_tiebreakers',jsonb_build_object('order',jsonb_build_array('POINTS','HEAD_TO_HEAD','SET_DIFF','GAME_DIFF'),'final','SEED'),
    'flyer_mode','AUTO','flyer_background','fondo1','flyer_title_color','#f8fafc','flyer_text_color','#e2e8f0','flyer_accent_color','#67e8f9',
    'flyer_badge_color','#06b6d4','flyer_date_block_color','#0891b2','flyer_data_card_color','#0f172a','flyer_data_card_opacity',0.72,
    'flyer_data_card_radius',16,'flyer_data_style','GLASS','flyer_title_size','LARGE','flyer_visible_fields',jsonb_build_object('date',true),
    'flyer_font','SPORT','flyer_font_weight','MEDIUM','flyer_style','MODERN','flyer_text_align','left','flyer_manual_url',null,'flyer_url',null,
    'poster_url',null,'flyer_manual_name',null,'flyer_manual_size',null,'flyer_manual_width',null,'flyer_manual_height',null);
  t:=public.create_tournament_canonical(club,base);
  if t.status<>'DRAFT' or t.category_id<>8 or t.rules_json is distinct from t.rules or t.rules_json is distinct from expected or not (t.rules_json ?& expected_keys)
     or t.classification_rules is distinct from '{}'::jsonb or t.score_rules is distinct from '{}'::jsonb or t.schedule_rules is distinct from '{}'::jsonb then
    raise exception 'Libres 8va no respetó el contrato canónico completo';
  end if;
  t:=public.create_tournament_canonical(club,base||jsonb_build_object('name','QA Libres 6ta','category_id',6));
  if t.gender<>'MALE' or t.segment<>'LIBRES' or t.category_id<>6 or t.fixed_category_id<>6 then
    raise exception 'Caballeros Libres 6ta inválido';
  end if;
  t:=public.create_tournament_canonical(club,base||jsonb_build_object('name','QA Suma XX','gender','MIXED','category_rule','CATEGORY_SUM','category_sum_target',13));
  if t.gender<>'MIXED' or t.category_rule<>'CATEGORY_SUM' or t.category_sum_target<>13 then raise exception 'Suma XX canónico inválido'; end if;
  t:=public.create_tournament_canonical(club,(base-'category_id')||jsonb_build_object('name','QA Sub16','gender','FEMALE','segment','MENORES','segment_type','MENORES','age_category_id',sub16));
  if t.gender<>'FEMALE' or t.segment<>'MENORES' or t.age_category_id<>sub16 then raise exception 'Menores Sub16 inválido'; end if;
  t:=public.create_tournament_canonical(club,(base-'category_id')||jsonb_build_object('name','QA +45','segment','VETERANOS','segment_type','VETERANOS','age_category_id',plus45));
  if t.segment<>'VETERANOS' or t.age_category_id<>plus45 then raise exception 'Veteranos +45 inválido'; end if;
  t:=public.create_tournament_canonical(club,base||jsonb_build_object('name','QA Eliminación directa','competition_system','SINGLE_ELIMINATION'));
  if t.rules_json->>'competition_system'<>'SINGLE_ELIMINATION' then raise exception 'Eliminación directa no preservada'; end if;
  t:=public.create_tournament_canonical(club,base||jsonb_build_object('name','QA Todos contra todos','competition_system','ROUND_ROBIN'));
  if t.rules_json->>'competition_system'<>'ROUND_ROBIN' then raise exception 'Todos contra todos no preservado'; end if;
  variant:=base||jsonb_build_object('name','QA Manual Flyer','schedule_config',jsonb_build_object(
    'mode','MANUAL','match_duration_minutes','75','groups',jsonb_build_object('date',(current_date+1)::text,'start_time','09:30','end_time','20:15'),
    'playoff',jsonb_build_object('date',(current_date+2)::text,'start_time','11:00','end_time','19:00')),
    'flyer',jsonb_build_object('flyer_mode','MANUAL','flyer_background','custom-bg','flyer_title_color','#111111','flyer_text_color','#222222',
      'flyer_accent_color','#333333','flyer_badge_color','#444444','flyer_date_block_color','#555555','flyer_data_card_color','#666666',
      'flyer_data_card_opacity','0,5','flyer_data_card_radius','20','flyer_data_style','SOLID','flyer_title_size','SMALL',
      'flyer_visible_fields',jsonb_build_object('date',true,'venue',false),'flyer_font','CLASSIC','flyer_font_weight','BOLD',
      'flyer_style','CUSTOM','flyer_text_align','center','flyer_manual_url','https://example.com/flyer.webp','flyer_manual_name','flyer.webp',
      'flyer_manual_size','2048','flyer_manual_width','1080','flyer_manual_height','1350'));
  t:=public.create_tournament_canonical(club,variant);
  if t.rules_json->'schedule_config' is distinct from jsonb_build_object('mode','MANUAL','match_duration_minutes',75,
       'groups',jsonb_build_object('date',(current_date+1)::text,'start_time','09:30','end_time','20:15'),
       'playoff',jsonb_build_object('date',(current_date+2)::text,'start_time','11:00','end_time','19:00'))
     or t.rules_json->>'flyer_mode'<>'MANUAL' or t.rules_json->>'flyer_background'<>'custom-bg'
     or t.rules_json->>'flyer_title_color'<>'#111111' or t.rules_json->>'flyer_text_color'<>'#222222'
     or t.rules_json->>'flyer_accent_color'<>'#333333' or t.rules_json->>'flyer_badge_color'<>'#444444'
     or t.rules_json->>'flyer_date_block_color'<>'#555555' or t.rules_json->>'flyer_data_card_color'<>'#666666'
     or t.rules_json->>'flyer_data_card_opacity'<>'0.5' or t.rules_json->>'flyer_data_card_radius'<>'20'
     or t.rules_json->>'flyer_data_style'<>'SOLID' or t.rules_json->>'flyer_title_size'<>'SMALL'
     or t.rules_json->>'flyer_font'<>'CLASSIC' or t.rules_json->>'flyer_font_weight'<>'BOLD'
     or t.rules_json->>'flyer_style'<>'CUSTOM' or t.rules_json->>'flyer_text_align'<>'center'
     or t.rules_json->>'flyer_manual_url'<>'https://example.com/flyer.webp' or t.rules_json->>'flyer_url'<>'https://example.com/flyer.webp'
     or t.rules_json->>'poster_url'<>'https://example.com/flyer.webp' or t.rules_json->>'flyer_manual_name'<>'flyer.webp'
     or t.rules_json->>'flyer_manual_size'<>'2048' or t.rules_json->>'flyer_manual_width'<>'1080'
     or t.rules_json->>'flyer_manual_height'<>'1350' or t.rules_json->'flyer_visible_fields' is distinct from jsonb_build_object('date',true,'venue',false) then
    raise exception 'Planificación manual o flyer personalizado no preservados';
  end if;
  failed:=false; begin perform public.create_tournament_canonical(club,base||jsonb_build_object('name','','category_id',99)); exception when others then failed:=true; end;
  if not failed then raise exception 'Payload inválido aceptado'; end if;
  reset role;
  fallback:=public.normalize_tournament_create_rules(base||jsonb_build_object(
    'points_config',jsonb_build_object('enabled',false,'editable',false,'winner','no-numero','finalist',''),
    'segment','libres','competition_system','round_robin','schedule_config',jsonb_build_object('mode','desconocido','match_duration_minutes','999999999999999999999'),
    'group_tiebreakers',jsonb_build_object('order',jsonb_build_array('desconocido'),'final','desconocido'),
    'flyer',jsonb_build_object('flyer_mode','MANUAL','flyer_data_card_opacity','NaN','flyer_data_card_radius','NaN',
      'flyer_manual_size','NaN','flyer_manual_width','','flyer_manual_height',null)));
  if fallback->'points_config'->'winner' is distinct from 'null'::jsonb or fallback->'points_config'->>'finalist'<>'0'
     or fallback->'schedule_config'->>'mode'<>'AUTO' or fallback->'schedule_config'->>'match_duration_minutes'<>'90'
     or fallback->>'segment_type'<>'LIBRES' or fallback->>'competition_system'<>'GROUPS_PLAYOFF'
     or fallback->'group_tiebreakers'->'order' is distinct from '["POINTS"]'::jsonb
     or fallback->'group_tiebreakers'->>'final'<>'SEED' or fallback->'flyer_data_card_opacity' is distinct from 'null'::jsonb
     or fallback->'flyer_data_card_radius' is distinct from 'null'::jsonb or fallback->'flyer_manual_size' is distinct from 'null'::jsonb
     or fallback->'flyer_manual_width' is distinct from 'null'::jsonb or fallback->'flyer_manual_height' is distinct from 'null'::jsonb then
    raise exception 'Fallbacks canónicos no coinciden con el POST anterior';
  end if;
  fallback:=public.normalize_tournament_create_rules('{}'::jsonb);
  if fallback->>'segment_type'<>'LIBRES' or fallback->>'competition_system'<>'GROUPS_PLAYOFF'
     or fallback->>'public_description' is not null or fallback->>'venue_name' is not null
     or fallback->'tournament_courts' is distinct from '[]'::jsonb
     or fallback->'schedule_config' is distinct from jsonb_build_object('mode','AUTO','match_duration_minutes',90,
       'groups',jsonb_build_object('date','','start_time','10:00','end_time','22:00'),
       'playoff',jsonb_build_object('date','','start_time','10:00','end_time','22:00'))
     or fallback->'points_config' is distinct from jsonb_build_object('enabled',false,'editable',false,'winner',0,'finalist',0,
       'semifinalist',0,'quarterfinalist',0,'eighthFinalist',0,'participation',0)
     or fallback ? 'group_tiebreakers' or fallback->>'flyer_mode'<>'NONE'
     or fallback->'flyer_visible_fields' is distinct from '{}'::jsonb then
    raise exception 'Defaults u opcionales vacíos no coinciden con el POST anterior';
  end if;
  perform set_config('request.jwt.claim.sub',actor::text,true); set local role authenticated;
  return query select 'PASS','Stage 5A.8A válido: creación canónica, segmentos, géneros, formatos, planificación, flyer, reglas, defaults y fallbacks';
exception when others then reset role; return query select 'FAIL',sqlerrm;
end $$;

select qa_status||' | '||qa_detail result from pg_temp.run_tournament_canonical_stage5a8a_qa();
rollback;
