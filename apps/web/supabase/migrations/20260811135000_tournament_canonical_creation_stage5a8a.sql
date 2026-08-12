begin;

do $$ begin
  if to_regclass('public.tournaments') is null or to_regclass('public.competition_age_categories') is null then
    raise exception 'Stage 5A.8A requiere Tournament Engine y categorías etarias.';
  end if;
end $$;

create or replace function public.tournament_safe_numeric(p_value text,p_fallback numeric)
returns numeric language plpgsql immutable security definer set search_path=pg_catalog as $$
declare value text:=replace(coalesce(p_value,''),',','.'); result numeric;
begin
  if value='' then return p_fallback; end if;
  if value!~'^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then return null; end if;
  begin result:=value::numeric; exception when others then return null; end;
  return result;
end $$;

create or replace function public.tournament_safe_integer(p_value text,p_fallback integer)
returns integer language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare result numeric;
begin
  result:=public.tournament_safe_numeric(p_value,p_fallback);
  begin return trunc(result)::integer; exception when others then return null; end;
end
$$;

create or replace function public.tournament_nullable_integer(p_value text)
returns integer language plpgsql immutable security definer set search_path=pg_catalog as $$
declare value text:=coalesce(p_value,''); result numeric;
begin
  if value='' or value!~'^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then return null; end if;
  begin result:=value::numeric; exception when others then return null; end;
  begin return trunc(result)::integer; exception when others then return null; end;
end $$;

create or replace function public.tournament_json_truthy(p_value jsonb)
returns boolean language sql immutable security definer set search_path=pg_catalog as $$
  select case jsonb_typeof(p_value)
    when 'boolean' then p_value='true'::jsonb
    when 'number' then (p_value#>>'{}')::numeric<>0
    when 'string' then length(p_value#>>'{}')>0
    when 'object' then true when 'array' then true else false end
$$;

create or replace function public.normalize_tournament_create_rules(p_payload jsonb)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
  p jsonb:=coalesce(p_payload,'{}'::jsonb); flyer jsonb; prizes jsonb; points jsonb; schedule jsonb;
  courts jsonb:='[]'::jsonb; tiebreakers jsonb; segment text; system text; mode text; manual boolean;
  start_date text; end_date text; duration integer; opacity numeric; radius integer;
begin
  if jsonb_typeof(p)<>'object' then raise exception 'Payload de torneo inválido.' using errcode='22023'; end if;
  flyer:=case when jsonb_typeof(p->'flyer')='object' then p->'flyer' else '{}'::jsonb end;
  prizes:=case when jsonb_typeof(p->'prizes')='object' then p->'prizes' else '{}'::jsonb end;
  points:=case when jsonb_typeof(p->'points_config')='object' then p->'points_config' else '{}'::jsonb end;
  schedule:=case when jsonb_typeof(p->'schedule_config')='object' then p->'schedule_config' else '{}'::jsonb end;
  segment:=coalesce(nullif(btrim(coalesce(p->>'segment_type',p->>'segment')),''),'LIBRES');
  if segment not in('LIBRES','MENORES','VETERANOS') then segment:='LIBRES'; end if;
  system:=coalesce(nullif(btrim(p->>'competition_system'),''),'GROUPS_PLAYOFF');
  if system not in('GROUPS_PLAYOFF','ROUND_ROBIN','SINGLE_ELIMINATION') then system:='GROUPS_PLAYOFF'; end if;
  start_date:=case when coalesce(p->>'start_date','')~'^\d{4}-\d{2}-\d{2}$' then p->>'start_date' else '' end;
  end_date:=case when coalesce(p->>'end_date','')~'^\d{4}-\d{2}-\d{2}$' then p->>'end_date' else start_date end;
  mode:=case when upper(coalesce(schedule->>'mode',''))='MANUAL' then 'MANUAL' else 'AUTO' end;
  duration:=public.tournament_safe_integer(schedule->>'match_duration_minutes',90);
  if duration is null or duration<=0 then duration:=90; end if;
  if jsonb_typeof(p->'tournament_courts')='array' then
    select coalesce(jsonb_agg((jsonb_build_object(
      'name',btrim(item->>'name'),'complex_name',nullif(btrim(item->>'complex_name'),''),
      'source',case when item->>'source'='EXTERNAL_COMPLEX' then 'EXTERNAL_COMPLEX' else 'OWN_CLUB' end
    )||case when nullif(btrim(item->>'id'),'') is not null then jsonb_build_object('id',btrim(item->>'id')) else '{}'::jsonb end) order by ordinal),'[]'::jsonb) into courts
    from jsonb_array_elements(p->'tournament_courts') with ordinality entry(item,ordinal)
    where jsonb_typeof(item)='object' and nullif(btrim(item->>'name'),'') is not null;
  end if;
  if p ? 'group_tiebreakers' then
    with source as (
      select upper(btrim(value #>> '{}')) value, ordinal
      from jsonb_array_elements(case when jsonb_typeof(p->'group_tiebreakers'->'order')='array'
        then p->'group_tiebreakers'->'order' else '["POINTS","SET_DIFF","GAME_DIFF"]'::jsonb end) with ordinality x(value,ordinal)
    ), normalized as (
      select distinct on (criterion) criterion,ordinal from (
        select case value when 'POINTS' then 'POINTS' when 'MATCH_POINTS' then 'POINTS'
          when 'HEAD_TO_HEAD' then 'HEAD_TO_HEAD' when 'H2H' then 'HEAD_TO_HEAD'
          when 'SET_DIFF' then 'SET_DIFF' when 'SET_DIFFERENCE' then 'SET_DIFF'
          when 'GAME_DIFF' then 'GAME_DIFF' when 'GAME_DIFFERENCE' then 'GAME_DIFF' end criterion,ordinal from source
      ) q where criterion is not null order by criterion,ordinal
    ), ordered as (select criterion,ordinal from normalized union all select 'POINTS',0 where not exists(select 1 from normalized where criterion='POINTS'))
    select jsonb_build_object('order',coalesce(jsonb_agg(criterion order by ordinal),'["POINTS","SET_DIFF","GAME_DIFF"]'::jsonb),
      'final',case upper(coalesce(p->'group_tiebreakers'->>'final','SEED')) when 'DRAW' then 'DRAW' when 'SORTEO' then 'DRAW' when 'MANUAL' then 'DRAW' else 'SEED' end)
    into tiebreakers from ordered;
  end if;
  opacity:=public.tournament_safe_numeric(flyer->>'flyer_data_card_opacity',0.72);
  if opacity is not null then opacity:=least(1,greatest(0,opacity)); end if;
  radius:=public.tournament_safe_integer(flyer->>'flyer_data_card_radius',16);
  if radius is not null then radius:=least(28,greatest(8,radius)); end if;
  manual:=nullif(btrim(flyer->>'flyer_mode'),'')='MANUAL';
  return jsonb_build_object(
    'wo_tolerance_minutes',10,'wo_score','6-0 6-0','segment_type',segment,
    'public_description',nullif(btrim(p->>'public_description'),''),
    'prizes',jsonb_build_object('enabled',public.tournament_json_truthy(prizes->'enabled'),
      'champion',nullif(btrim(prizes->>'champion'),''),'runner_up',nullif(btrim(prizes->>'runner_up'),'')),
    'competition_system',system,'venue_name',nullif(btrim(p->>'venue_name'),''),'tournament_courts',courts,
    'schedule_config',jsonb_build_object('mode',mode,'match_duration_minutes',duration,
      'groups',jsonb_build_object('date',case when coalesce(schedule->'groups'->>'date','')~'^\d{4}-\d{2}-\d{2}$' then schedule->'groups'->>'date' else start_date end,
        'start_time',case when coalesce(schedule->'groups'->>'start_time','')~'^\d{2}:\d{2}$' then schedule->'groups'->>'start_time' else '10:00' end,
        'end_time',case when coalesce(schedule->'groups'->>'end_time','')~'^\d{2}:\d{2}$' then schedule->'groups'->>'end_time' else '22:00' end),
      'playoff',jsonb_build_object('date',case when coalesce(schedule->'playoff'->>'date','')~'^\d{4}-\d{2}-\d{2}$' then schedule->'playoff'->>'date' else end_date end,
        'start_time',case when coalesce(schedule->'playoff'->>'start_time','')~'^\d{2}:\d{2}$' then schedule->'playoff'->>'start_time' else '10:00' end,
        'end_time',case when coalesce(schedule->'playoff'->>'end_time','')~'^\d{2}:\d{2}$' then schedule->'playoff'->>'end_time' else '22:00' end)),
    'points_config',jsonb_build_object('enabled',public.tournament_json_truthy(points->'enabled'),'editable',public.tournament_json_truthy(points->'editable'),
      'winner',public.tournament_safe_integer(points->>'winner',0),'finalist',public.tournament_safe_integer(points->>'finalist',0),
      'semifinalist',public.tournament_safe_integer(points->>'semifinalist',0),'quarterfinalist',public.tournament_safe_integer(points->>'quarterfinalist',0),
      'eighthFinalist',public.tournament_safe_integer(points->>'eighthFinalist',0),'participation',public.tournament_safe_integer(points->>'participation',0)),
    'flyer_mode',coalesce(nullif(btrim(flyer->>'flyer_mode'),''),'NONE'),'flyer_background',coalesce(nullif(btrim(flyer->>'flyer_background'),''),'fondo1'),
    'flyer_title_color',coalesce(nullif(btrim(flyer->>'flyer_title_color'),''),'#f8fafc'),'flyer_text_color',coalesce(nullif(btrim(flyer->>'flyer_text_color'),''),'#e2e8f0'),
    'flyer_accent_color',coalesce(nullif(btrim(flyer->>'flyer_accent_color'),''),'#67e8f9'),'flyer_badge_color',coalesce(nullif(btrim(flyer->>'flyer_badge_color'),''),'#06b6d4'),
    'flyer_date_block_color',coalesce(nullif(btrim(flyer->>'flyer_date_block_color'),''),'#0891b2'),'flyer_data_card_color',coalesce(nullif(btrim(flyer->>'flyer_data_card_color'),''),'#0f172a'),
    'flyer_data_card_opacity',opacity,'flyer_data_card_radius',radius,'flyer_data_style',coalesce(nullif(btrim(flyer->>'flyer_data_style'),''),'GLASS'),
    'flyer_title_size',coalesce(nullif(btrim(flyer->>'flyer_title_size'),''),'LARGE'),'flyer_visible_fields',case when jsonb_typeof(flyer->'flyer_visible_fields')='object' then flyer->'flyer_visible_fields' else '{}'::jsonb end,
    'flyer_font',coalesce(nullif(btrim(flyer->>'flyer_font'),''),'SPORT'),'flyer_font_weight',coalesce(nullif(btrim(flyer->>'flyer_font_weight'),''),'MEDIUM'),
    'flyer_style',coalesce(nullif(btrim(flyer->>'flyer_style'),''),'MODERN'),'flyer_text_align',coalesce(nullif(btrim(flyer->>'flyer_text_align'),''),'left'),
    'flyer_manual_url',case when manual then nullif(btrim(flyer->>'flyer_manual_url'),'') end,'flyer_url',case when manual then nullif(btrim(flyer->>'flyer_manual_url'),'') end,
    'poster_url',case when manual then nullif(btrim(flyer->>'flyer_manual_url'),'') end,'flyer_manual_name',case when manual then nullif(btrim(flyer->>'flyer_manual_name'),'') end,
    'flyer_manual_size',case when manual then public.tournament_nullable_integer(flyer->>'flyer_manual_size') end,'flyer_manual_width',case when manual then public.tournament_nullable_integer(flyer->>'flyer_manual_width') end,
    'flyer_manual_height',case when manual then public.tournament_nullable_integer(flyer->>'flyer_manual_height') end
  )||case when tiebreakers is not null then jsonb_build_object('group_tiebreakers',tiebreakers) else '{}'::jsonb end;
end $$;

create or replace function public.create_tournament_canonical(p_club_id uuid,p_payload jsonb)
returns public.tournaments language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); p jsonb:=coalesce(p_payload,'{}'::jsonb); rules jsonb; result public.tournaments%rowtype;
  name text; kind text; gender text; segment text; category_rule text; category_id integer; sum_target integer; age_id uuid;
  starts date; ends date; deadline timestamptz; price numeric; minimum integer; maximum integer; age public.competition_age_categories%rowtype;
begin
  if actor is null then raise exception 'Sesión requerida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'tournaments:create') then raise exception 'Sin permiso para crear torneos.' using errcode='42501'; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Payload de torneo inválido.' using errcode='22023'; end if;
  name:=nullif(btrim(p->>'name'),''); kind:=coalesce(nullif(btrim(coalesce(p->>'type',p->>'tournament_type')),''),'OPEN');
  gender:=coalesce(nullif(btrim(p->>'gender'),''),'MALE'); rules:=public.normalize_tournament_create_rules(p);
  segment:=rules->>'segment_type'; category_rule:=case when p->>'category_rule'='CATEGORY_SUM' then 'CATEGORY_SUM' else 'FIXED_CATEGORY' end;
  begin category_id:=coalesce(nullif(p->>'category_id','')::integer,0); exception when others then raise exception 'Categoría inválida.' using errcode='22023'; end;
  begin sum_target:=coalesce(nullif(p->>'category_sum_target','')::integer,0); exception when others then raise exception 'Suma inválida.' using errcode='22023'; end;
  begin age_id:=nullif(p->>'age_category_id','')::uuid; exception when others then raise exception 'Categoría etaria inválida.' using errcode='22023'; end;
  begin starts:=nullif(p->>'start_date','')::date; ends:=nullif(p->>'end_date','')::date; deadline:=nullif(p->>'registration_deadline','')::timestamptz;
    price:=coalesce(nullif(replace(p->>'price_per_player',',','.'),'')::numeric,0); minimum:=coalesce(nullif(p->>'min_pairs','')::integer,6); maximum:=nullif(p->>'max_pairs','')::integer;
  exception when others then raise exception 'Fechas, cupos o precio inválidos.' using errcode='22023'; end;
  if name is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if kind not in('OPEN','CHALLENGER','MASTER','MASTER_FINAL') then raise exception 'Tipo de torneo inválido.' using errcode='22023'; end if;
  if gender not in('MALE','FEMALE','MIXED') then raise exception 'Género de torneo inválido.' using errcode='22023'; end if;
  if segment='LIBRES' then
    if age_id is not null then raise exception 'Libres no admite categoría de edad.' using errcode='23514'; end if;
    if category_rule='FIXED_CATEGORY' and category_id not between 1 and 8 then raise exception 'La categoría debe estar entre 1 y 8.' using errcode='23514'; end if;
    if category_rule='CATEGORY_SUM' and sum_target not between 2 and 16 then raise exception 'La suma debe estar entre 2 y 16.' using errcode='23514'; end if;
  else
    if category_rule='CATEGORY_SUM' then raise exception 'Suma XX solo está disponible para Libres.' using errcode='23514'; end if;
    if age_id is null then raise exception 'Seleccioná una categoría de edad.' using errcode='23514'; end if;
    select * into age from public.competition_age_categories c where c.id=age_id and c.club_id=p_club_id and c.is_active;
    if not found or age.age_reference_rule not in('EVENT_START_DATE','CALENDAR_YEAR_END','FIXED_DATE')
       or (segment='MENORES' and (age.max_age is null or age.max_age>18))
       or (segment='VETERANOS' and (age.min_age is null or age.min_age<18)) then raise exception 'Categoría etaria incompatible.' using errcode='23514'; end if;
  end if;
  if starts is null or (ends is not null and ends<starts) or (deadline is not null and deadline::date>starts)
     or price<0 or minimum<2 or (maximum is not null and maximum<minimum) then raise exception 'Fechas, cupos o precio inválidos.' using errcode='23514'; end if;
  insert into public.tournaments(club_id,name,type,tournament_type,format,gender,segment,category_id,category,category_rule,fixed_category_id,category_sum_target,age_category_id,
    start_date,starts_on,end_date,ends_on,registration_deadline,signup_deadline,status,price_per_player,min_pairs,max_pairs,points_total,points_enabled,points_scheme_id,description,rules,rules_json,created_at,updated_at)
  values(p_club_id,name,kind,kind,'GROUPS_ELIMINATION',gender,segment,case when segment='LIBRES' then category_id end,case when segment='LIBRES' then category_id end,
    category_rule,case when segment='LIBRES' and category_rule='FIXED_CATEGORY' then category_id end,case when category_rule='CATEGORY_SUM' then sum_target end,case when segment<>'LIBRES' then age_id end,
    starts,starts,ends,ends,deadline,deadline,'DRAFT',price,minimum,maximum,0,false,null,null,rules,rules,now(),now()) returning * into result;
  return result;
end $$;

revoke all on function public.normalize_tournament_create_rules(jsonb) from public,anon,authenticated;
revoke all on function public.tournament_safe_numeric(text,numeric) from public,anon,authenticated;
revoke all on function public.tournament_safe_integer(text,integer) from public,anon,authenticated;
revoke all on function public.tournament_nullable_integer(text) from public,anon,authenticated;
revoke all on function public.tournament_json_truthy(jsonb) from public,anon,authenticated;
revoke all on function public.create_tournament_canonical(uuid,jsonb) from public,anon;
grant execute on function public.create_tournament_canonical(uuid,jsonb) to authenticated,service_role;
comment on function public.create_tournament_canonical(uuid,jsonb) is 'Canonical Tournament Engine DRAFT creation used by independent tournaments and Competition date bridge.';

commit;
