alter table public.tournament_matches
  add column if not exists group_id uuid references public.tournament_groups(id) on delete set null;

create index if not exists tournament_matches_group_id_idx
  on public.tournament_matches(group_id);

create or replace function public.validate_tournament_match_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_tournament_club uuid;
  v_group_tournament_id uuid;
  v_team1 record;
  v_team2 record;
  v_winner record;
begin
  select club_id into v_tournament_club
  from public.tournaments
  where id = new.tournament_id;

  if v_tournament_club is null then
    raise exception 'Torneo no encontrado';
  end if;

  if v_tournament_club <> new.club_id then
    raise exception 'El club del partido no coincide con el torneo';
  end if;

  if new.group_id is not null then
    select tournament_id into v_group_tournament_id
    from public.tournament_groups
    where id = new.group_id;

    if v_group_tournament_id is null then
      raise exception 'Grupo no encontrado';
    end if;

    if v_group_tournament_id <> new.tournament_id then
      raise exception 'El grupo del partido no pertenece al torneo indicado';
    end if;
  end if;

  select id, tournament_id, club_id into v_team1
  from public.tournament_teams
  where id = new.team1_id;

  select id, tournament_id, club_id into v_team2
  from public.tournament_teams
  where id = new.team2_id;

  if v_team1.id is null or v_team2.id is null then
    raise exception 'Equipo no encontrado';
  end if;

  if v_team1.tournament_id <> new.tournament_id or v_team2.tournament_id <> new.tournament_id then
    raise exception 'Ambos equipos deben pertenecer al torneo del partido';
  end if;

  if v_team1.club_id <> new.club_id or v_team2.club_id <> new.club_id then
    raise exception 'Ambos equipos deben pertenecer al club del partido';
  end if;

  if new.winner_team_id is not null then
    select id, tournament_id, club_id into v_winner
    from public.tournament_teams
    where id = new.winner_team_id;

    if v_winner.id is null then
      raise exception 'Equipo ganador no encontrado';
    end if;

    if v_winner.id not in (new.team1_id, new.team2_id) then
      raise exception 'El ganador debe ser uno de los equipos del partido';
    end if;
  end if;

  return new;
end;
$$;
