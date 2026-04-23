create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  size integer not null,
  "order" integer not null,
  constraint tournament_groups_size_chk check (size in (3, 4)),
  constraint tournament_groups_order_chk check ("order" > 0),
  constraint tournament_groups_name_chk check (length(btrim(name)) > 0),
  constraint tournament_groups_tournament_name_key unique (tournament_id, name),
  constraint tournament_groups_tournament_order_key unique (tournament_id, "order")
);

create table if not exists public.tournament_group_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  seed integer not null,
  position integer,
  constraint tournament_group_teams_seed_chk check (seed > 0),
  constraint tournament_group_teams_position_chk check (position is null or position > 0),
  constraint tournament_group_teams_tournament_team_key unique (tournament_id, team_id),
  constraint tournament_group_teams_group_seed_key unique (group_id, seed)
);

create unique index if not exists tournament_group_teams_group_position_key
  on public.tournament_group_teams(group_id, position)
  where position is not null;

create index if not exists tournament_groups_tournament_id_idx
  on public.tournament_groups(tournament_id);

create index if not exists tournament_group_teams_tournament_id_idx
  on public.tournament_group_teams(tournament_id);

create index if not exists tournament_group_teams_group_id_idx
  on public.tournament_group_teams(group_id);

create index if not exists tournament_group_teams_team_id_idx
  on public.tournament_group_teams(team_id);

create or replace function public.validate_tournament_group_team_scope()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_group_tournament_id uuid;
  v_group_size integer;
  v_team_tournament_id uuid;
  v_group_count integer;
begin
  select tournament_id, size
    into v_group_tournament_id, v_group_size
  from public.tournament_groups
  where id = new.group_id;

  if v_group_tournament_id is null then
    raise exception 'Grupo no encontrado';
  end if;

  if v_group_tournament_id <> new.tournament_id then
    raise exception 'El grupo no pertenece al torneo indicado';
  end if;

  select tournament_id
    into v_team_tournament_id
  from public.tournament_teams
  where id = new.team_id;

  if v_team_tournament_id is null then
    raise exception 'Equipo no encontrado';
  end if;

  if v_team_tournament_id <> new.tournament_id then
    raise exception 'El equipo no pertenece al torneo indicado';
  end if;

  select count(*)
    into v_group_count
  from public.tournament_group_teams tgt
  where tgt.group_id = new.group_id
    and tgt.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_group_count >= v_group_size then
    raise exception 'El grupo ya alcanzo su tamaño maximo';
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_group_teams_validate_scope on public.tournament_group_teams;
create trigger tournament_group_teams_validate_scope
  before insert or update on public.tournament_group_teams
  for each row execute function public.validate_tournament_group_team_scope();

alter table public.tournament_groups enable row level security;
alter table public.tournament_group_teams enable row level security;

drop policy if exists tournament_groups_select_member_or_platform on public.tournament_groups;
create policy tournament_groups_select_member_or_platform
  on public.tournament_groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tournaments t
      join public.club_memberships cm on cm.club_id = t.club_id
      where t.id = tournament_groups.tournament_id
        and cm.user_id = auth.uid()
        and cm.status = 'APPROVED'
        and cm.approved_at is not null
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists tournament_group_teams_select_member_or_platform on public.tournament_group_teams;
create policy tournament_group_teams_select_member_or_platform
  on public.tournament_group_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tournaments t
      join public.club_memberships cm on cm.club_id = t.club_id
      where t.id = tournament_group_teams.tournament_id
        and cm.user_id = auth.uid()
        and cm.status = 'APPROVED'
        and cm.approved_at is not null
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
