begin;

-- The production database contained the canonical function, but PostgREST had
-- not registered it. Re-declaring the unchanged primitive emits the canonical
-- function definition again and keeps its existing contract intact.
create or replace function public.publish_tournament_atomic(
  p_club_id uuid,
  p_tournament_id uuid
)
returns public.tournaments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_tournament public.tournaments%rowtype;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not (public.is_platform_admin() or public.has_club_capability(p_club_id, 'tournaments:publish')) then
    raise exception 'TOURNAMENT_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id and club_id = p_club_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tournament.status <> 'DRAFT' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '23514';
  end if;
  if nullif(btrim(v_tournament.name), '') is null then
    raise exception 'TOURNAMENT_NAME_REQUIRED' using errcode = '23514';
  end if;
  if v_tournament.start_date is null or v_tournament.end_date is null then
    raise exception 'TOURNAMENT_DATES_REQUIRED' using errcode = '23514';
  end if;
  if v_tournament.end_date < v_tournament.start_date then
    raise exception 'TOURNAMENT_DATE_RANGE_INVALID' using errcode = '23514';
  end if;
  if v_tournament.registration_deadline is null then
    raise exception 'REGISTRATION_DEADLINE_REQUIRED' using errcode = '23514';
  end if;
  if v_tournament.price_per_player is null or v_tournament.price_per_player < 0 then
    raise exception 'TOURNAMENT_PRICE_REQUIRED' using errcode = '23514';
  end if;
  if coalesce(v_tournament.min_pairs, 0) < 2 then
    raise exception 'TOURNAMENT_MIN_PAIRS_INVALID' using errcode = '23514';
  end if;
  if v_tournament.max_pairs is not null and v_tournament.max_pairs < v_tournament.min_pairs then
    raise exception 'TOURNAMENT_CAPACITY_INVALID' using errcode = '23514';
  end if;

  update public.tournaments
  set status = 'OPEN', updated_at = now()
  where id = v_tournament.id
  returning * into v_tournament;

  return v_tournament;
end;
$$;

revoke all on function public.publish_tournament_atomic(uuid, uuid) from public, anon;
grant execute on function public.publish_tournament_atomic(uuid, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';

commit;
