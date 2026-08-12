begin;

-- Follow-up for the already-applied type fix: category_rule is also an enum.
create or replace function public.create_tournament_canonical(p_club_id uuid,p_payload jsonb)
returns public.tournaments language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); p jsonb:=coalesce(p_payload,'{}'::jsonb); rules jsonb; result public.tournaments%rowtype;
  name text; kind public.tournament_type; gender text; segment text; category_rule public.tournament_category_rule; category_id integer; sum_target integer; age_id uuid;
  starts date; ends date; deadline timestamptz; price numeric; minimum integer; maximum integer; age public.competition_age_categories%rowtype;
begin
  if actor is null then raise exception 'Sesión requerida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'tournaments:create') then raise exception 'Sin permiso para crear torneos.' using errcode='42501'; end if;
  if jsonb_typeof(p)<>'object' then raise exception 'Payload de torneo inválido.' using errcode='22023'; end if;
  name:=nullif(btrim(p->>'name'),'');
  begin kind:=coalesce(nullif(btrim(coalesce(p->>'type',p->>'tournament_type')),''),'OPEN')::public.tournament_type;
  exception when invalid_text_representation then raise exception 'Tipo de torneo inválido.' using errcode='22023'; end;
  gender:=coalesce(nullif(btrim(p->>'gender'),''),'MALE'); rules:=public.normalize_tournament_create_rules(p);
  segment:=rules->>'segment_type';
  category_rule:=case when p->>'category_rule'='CATEGORY_SUM' then 'CATEGORY_SUM'::public.tournament_category_rule else 'FIXED_CATEGORY'::public.tournament_category_rule end;
  begin category_id:=coalesce(nullif(p->>'category_id','')::integer,0); exception when others then raise exception 'Categoría inválida.' using errcode='22023'; end;
  begin sum_target:=coalesce(nullif(p->>'category_sum_target','')::integer,0); exception when others then raise exception 'Suma inválida.' using errcode='22023'; end;
  begin age_id:=nullif(p->>'age_category_id','')::uuid; exception when others then raise exception 'Categoría etaria inválida.' using errcode='22023'; end;
  begin starts:=nullif(p->>'start_date','')::date; ends:=nullif(p->>'end_date','')::date; deadline:=nullif(p->>'registration_deadline','')::timestamptz;
    price:=coalesce(nullif(replace(p->>'price_per_player',',','.'),'')::numeric,0); minimum:=coalesce(nullif(p->>'min_pairs','')::integer,6); maximum:=nullif(p->>'max_pairs','')::integer;
  exception when others then raise exception 'Fechas, cupos o precio inválidos.' using errcode='22023'; end;
  if name is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
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
  values(p_club_id,name,kind,kind::text,'GROUPS_ELIMINATION',gender,segment,case when segment='LIBRES' then category_id end,case when segment='LIBRES' then category_id end,
    category_rule,case when segment='LIBRES' and category_rule='FIXED_CATEGORY' then category_id end,case when category_rule='CATEGORY_SUM' then sum_target end,case when segment<>'LIBRES' then age_id end,
    starts,starts,ends,ends,deadline,deadline,'DRAFT',price,minimum,maximum,0,false,null,null,rules,rules,now(),now()) returning * into result;
  return result;
end $$;

revoke all on function public.create_tournament_canonical(uuid,jsonb) from public,anon;
grant execute on function public.create_tournament_canonical(uuid,jsonb) to authenticated,service_role;

commit;
