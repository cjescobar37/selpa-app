begin;

-- A logical slot can only contain one match. This makes retries and concurrent
-- generators fail safely instead of duplicating the fixture.
create unique index tournament_matches_logical_slot_key
  on public.tournament_matches(tournament_id, phase, round, match_order);

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

create or replace function public.tg_mark_tournament_running_from_result()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status::text = 'PLAYED' and old.status::text <> 'PLAYED' then
    update public.tournaments
    set status = 'RUNNING', updated_at = now()
    where id = new.tournament_id
      and club_id = new.club_id
      and status = 'OPEN';
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_matches_mark_running on public.tournament_matches;
create trigger tournament_matches_mark_running
after update of status on public.tournament_matches
for each row execute function public.tg_mark_tournament_running_from_result();

create or replace function public.finalize_tournament_atomic(
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
  v_final public.tournament_matches%rowtype;
  v_pending integer;
  v_final_count integer;
  v_rules jsonb;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not (public.is_platform_admin() or public.has_club_capability(p_club_id, 'tournaments:update')) then
    raise exception 'TOURNAMENT_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id and club_id = p_club_id
  for update;

  if not found then
    raise exception 'TOURNAMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tournament.status = 'FINISHED' then
    if coalesce(v_tournament.rules_json, v_tournament.rules, '{}'::jsonb) ? 'tournament_finalization' then
      return v_tournament;
    end if;
    raise exception 'TOURNAMENT_FINALIZATION_SNAPSHOT_MISSING' using errcode = '23514';
  end if;
  if v_tournament.status not in ('OPEN', 'RUNNING') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '23514';
  end if;

  select count(*) into v_pending
  from public.tournament_matches
  where tournament_id = v_tournament.id
    and club_id = p_club_id
    and status::text not in ('PLAYED', 'CANCELLED');
  if v_pending > 0 then
    raise exception 'TOURNAMENT_MATCHES_PENDING' using errcode = '23514';
  end if;

  select count(*) into v_final_count
  from public.tournament_matches
  where tournament_id = v_tournament.id
    and club_id = p_club_id
    and phase::text = 'FINAL';
  if v_final_count <> 1 then
    raise exception 'TOURNAMENT_FINAL_REQUIRED' using errcode = '23514';
  end if;

  select * into v_final
  from public.tournament_matches
  where tournament_id = v_tournament.id
    and club_id = p_club_id
    and phase::text = 'FINAL'
  for update;
  if v_final.status::text <> 'PLAYED' or v_final.winner_team_id is null then
    raise exception 'TOURNAMENT_FINAL_RESULT_REQUIRED' using errcode = '23514';
  end if;
  if v_final.winner_team_id not in (v_final.team1_id, v_final.team2_id) then
    raise exception 'TOURNAMENT_FINAL_WINNER_INVALID' using errcode = '23514';
  end if;

  v_rules := coalesce(v_tournament.rules_json, v_tournament.rules, '{}'::jsonb);
  v_rules := jsonb_set(
    v_rules,
    '{tournament_finalization}',
    jsonb_build_object(
      'champion_team_id', v_final.winner_team_id,
      'final_match_id', v_final.id,
      'finalized_at', now(),
      'finalized_by', v_actor
    ),
    true
  );

  update public.tournaments
  set status = 'FINISHED', rules_json = v_rules, rules = v_rules, updated_at = now()
  where id = v_tournament.id
  returning * into v_tournament;

  return v_tournament;
end;
$$;

revoke all on function public.publish_tournament_atomic(uuid, uuid) from public, anon;
revoke all on function public.finalize_tournament_atomic(uuid, uuid) from public, anon;
grant execute on function public.publish_tournament_atomic(uuid, uuid) to authenticated, service_role;
grant execute on function public.finalize_tournament_atomic(uuid, uuid) to authenticated, service_role;

comment on function public.publish_tournament_atomic(uuid, uuid) is
  'Canonical DRAFT -> OPEN transition with server-side structural validation.';
comment on function public.finalize_tournament_atomic(uuid, uuid) is
  'Canonical Tournament finalization. Requires a completed unique final, persists champion snapshot, and preserves all history.';

commit;
