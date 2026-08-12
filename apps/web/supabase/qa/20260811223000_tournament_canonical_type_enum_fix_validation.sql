begin;

create or replace function pg_temp.run_tournament_canonical_type_enum_fix_qa()
returns table(qa_status text, qa_detail text)
language plpgsql
as $$
declare
  v_actor uuid;
  v_club uuid;
  v_tournament public.tournaments%rowtype;
begin
  if to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null then
    return query select 'FAIL', 'QA no ejecutable: falta la función canónica';
    return;
  end if;

  select membership.user_id, membership.club_id
  into v_actor, v_club
  from public.club_memberships membership
  where membership.role = 'OWNER'
    and membership.status = 'APPROVED'
    and membership.approved_at is not null
  order by membership.created_at, membership.user_id
  limit 1;

  if v_actor is null then
    return query select 'FAIL', 'QA no ejecutable: se requiere un OWNER aprobado';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  v_tournament := public.create_tournament_canonical(
    v_club,
    jsonb_build_object(
      'name', 'QA Tournament Type Enum',
      'type', 'OPEN',
      'gender', 'MALE',
      'segment', 'LIBRES',
      'category_id', 6,
      'category_rule', 'FIXED_CATEGORY',
      'start_date', (current_date + 1)::text,
      'min_pairs', 2,
      'price_per_player', 0
    )
  );

  if v_tournament.type <> 'OPEN'::public.tournament_type
     or v_tournament.tournament_type <> 'OPEN'
     or v_tournament.status <> 'DRAFT' then
    raise exception 'El Tournament creado no preservó type enum, tournament_type text o DRAFT';
  end if;

  v_tournament := public.create_tournament_canonical(
    v_club,
    jsonb_build_object(
      'name', 'QA Tournament Category Rule Enum',
      'type', 'OPEN',
      'gender', 'MIXED',
      'segment', 'LIBRES',
      'category_id', 6,
      'category_rule', 'CATEGORY_SUM',
      'category_sum_target', 13,
      'start_date', (current_date + 1)::text,
      'min_pairs', 2,
      'price_per_player', 0
    )
  );

  if v_tournament.category_rule <> 'CATEGORY_SUM'::public.tournament_category_rule
     or v_tournament.category_sum_target <> 13 then
    raise exception 'El Tournament creado no preservó category_rule enum';
  end if;

  reset role;
  return query select 'PASS', 'Correcciones enum válidas: type y category_rule usan sus enums; tournament_type conserva text';
exception when others then
  reset role;
  return query select 'FAIL', sqlerrm;
end;
$$;

select qa_status || ' | ' || qa_detail as result
from pg_temp.run_tournament_canonical_type_enum_fix_qa();

rollback;
