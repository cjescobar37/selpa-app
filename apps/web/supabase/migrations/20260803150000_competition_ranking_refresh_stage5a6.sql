begin;

do $$ begin
  if to_regclass('public.competition_point_transactions') is null
     or to_regprocedure('public.get_competition_points_totals(uuid,uuid,uuid)') is null then
    raise exception 'Stage 5A.6 requiere Competition Points Ledger Stage 4.';
  end if;
end $$;

create table public.competition_ranking_refresh_scopes (
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null,
  division_id uuid not null,
  revision bigint not null default 1,
  transaction_count bigint not null default 0,
  points_total bigint not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key(club_id,season_id,division_id),
  constraint competition_ranking_refresh_scope_season_fkey foreign key(club_id,season_id) references public.competition_seasons(club_id,id) on delete restrict,
  constraint competition_ranking_refresh_scope_division_fkey foreign key(club_id,division_id) references public.competition_divisions(club_id,id) on delete restrict,
  constraint competition_ranking_refresh_scope_values_chk check(revision>0 and transaction_count>=0)
);

create table public.competition_ranking_entry_totals (
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null,
  division_id uuid not null,
  player_entry_id uuid not null,
  club_player_id uuid not null,
  total_points bigint not null default 0,
  transaction_count bigint not null default 0,
  refresh_revision bigint not null,
  refreshed_at timestamptz not null default now(),
  primary key(club_id,season_id,division_id,player_entry_id),
  constraint competition_ranking_totals_scope_fkey foreign key(club_id,season_id,division_id) references public.competition_ranking_refresh_scopes(club_id,season_id,division_id) on delete cascade,
  constraint competition_ranking_totals_entry_fkey foreign key(club_id,player_entry_id) references public.competition_player_entries(club_id,id) on delete restrict,
  constraint competition_ranking_totals_player_fkey foreign key(club_id,club_player_id) references public.club_players(club_id,id) on delete restrict,
  constraint competition_ranking_totals_values_chk check(transaction_count>=0 and refresh_revision>0)
);
create index competition_ranking_entry_totals_lookup_idx on public.competition_ranking_entry_totals(club_id,season_id,division_id,total_points desc,player_entry_id);

create or replace function public.refresh_competition_ranking_scope(p_club_id uuid,p_season_id uuid,p_division_id uuid)
returns public.competition_ranking_refresh_scopes
language plpgsql security definer set search_path=pg_catalog,public as $$
declare scope_row public.competition_ranking_refresh_scopes%rowtype;
begin
  if not exists(select 1 from public.competition_divisions d where d.id=p_division_id and d.club_id=p_club_id and d.season_id=p_season_id) then raise exception 'RANKING_SCOPE_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.competition_ranking_refresh_scopes(club_id,season_id,division_id)
  values(p_club_id,p_season_id,p_division_id)
  on conflict(club_id,season_id,division_id) do update set revision=competition_ranking_refresh_scopes.revision+1,refreshed_at=now()
  returning * into scope_row;

  with totals as (
    select entry.id player_entry_id,entry.club_player_id,coalesce(sum(tx.points),0)::bigint total_points,count(tx.id)::bigint transaction_count
    from public.competition_player_entries entry
    join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
    left join public.competition_point_transactions tx on tx.club_id=entry.club_id and tx.season_id=p_season_id and tx.division_id=entry.division_id and tx.player_entry_id=entry.id
    where entry.club_id=p_club_id and entry.division_id=p_division_id and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null
    group by entry.id,entry.club_player_id
  )
  insert into public.competition_ranking_entry_totals(club_id,season_id,division_id,player_entry_id,club_player_id,total_points,transaction_count,refresh_revision,refreshed_at)
  select p_club_id,p_season_id,p_division_id,t.player_entry_id,t.club_player_id,t.total_points,t.transaction_count,scope_row.revision,now() from totals t
  on conflict(club_id,season_id,division_id,player_entry_id) do update set club_player_id=excluded.club_player_id,total_points=excluded.total_points,transaction_count=excluded.transaction_count,refresh_revision=excluded.refresh_revision,refreshed_at=excluded.refreshed_at;

  delete from public.competition_ranking_entry_totals cached
  where cached.club_id=p_club_id and cached.season_id=p_season_id and cached.division_id=p_division_id
    and not exists(select 1 from public.competition_player_entries entry join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id where entry.id=cached.player_entry_id and entry.club_id=p_club_id and entry.division_id=p_division_id and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null);

  update public.competition_ranking_refresh_scopes scope set
    transaction_count=coalesce((select sum(cached.transaction_count) from public.competition_ranking_entry_totals cached where cached.club_id=p_club_id and cached.season_id=p_season_id and cached.division_id=p_division_id),0),
    points_total=coalesce((select sum(cached.total_points) from public.competition_ranking_entry_totals cached where cached.club_id=p_club_id and cached.season_id=p_season_id and cached.division_id=p_division_id),0),refreshed_at=now()
  where scope.club_id=p_club_id and scope.season_id=p_season_id and scope.division_id=p_division_id returning * into scope_row;
  return scope_row;
end $$;

create or replace function public.refresh_competition_ranking_from_ledger_insert()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare affected record;
begin
  for affected in
    select distinct rows.club_id,rows.season_id,rows.division_id
    from inserted_competition_points rows
    order by rows.club_id,rows.season_id,rows.division_id
  loop
    perform public.refresh_competition_ranking_scope(affected.club_id,affected.season_id,affected.division_id);
  end loop;
  return null;
end $$;

create trigger trg_refresh_competition_ranking_after_ledger_insert
after insert on public.competition_point_transactions
referencing new table as inserted_competition_points
for each statement execute function public.refresh_competition_ranking_from_ledger_insert();

create or replace function public.get_competition_points_totals(p_club_id uuid,p_season_id uuid,p_division_id uuid default null)
returns table(player_entry_id uuid,club_player_id uuid,division_id uuid,total_points bigint)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.competition_points_server_authorized(p_club_id,'ranking:view') then raise exception 'Sin permisos para consultar puntos.' using errcode='42501'; end if;
  return query select entry.id,entry.club_player_id,entry.division_id,coalesce(cached.total_points,0)::bigint
  from public.competition_player_entries entry
  join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
  join public.club_players player on player.id=entry.club_player_id and player.club_id=entry.club_id
  left join public.competition_ranking_entry_totals cached on cached.club_id=entry.club_id and cached.season_id=division.season_id and cached.division_id=entry.division_id and cached.player_entry_id=entry.id
  where entry.club_id=p_club_id and division.season_id=p_season_id and(p_division_id is null or entry.division_id=p_division_id) and division.modality='INDIVIDUAL' and division.segment_id is null and division.is_active and entry.status='ACTIVE' and entry.valid_until is null and player.approved_at is not null
  order by entry.division_id,entry.id;
end $$;

do $$ declare scope_row record; begin
  for scope_row in select d.club_id,d.season_id,d.id division_id from public.competition_divisions d where d.modality='INDIVIDUAL' and d.segment_id is null and d.is_active loop
    perform public.refresh_competition_ranking_scope(scope_row.club_id,scope_row.season_id,scope_row.division_id);
  end loop;
end $$;

alter table public.competition_ranking_refresh_scopes enable row level security;
alter table public.competition_ranking_entry_totals enable row level security;
revoke all on table public.competition_ranking_refresh_scopes,public.competition_ranking_entry_totals from public,anon,authenticated;
revoke all on function public.refresh_competition_ranking_scope(uuid,uuid,uuid),public.refresh_competition_ranking_from_ledger_insert() from public,anon,authenticated;
grant execute on function public.get_competition_points_totals(uuid,uuid,uuid) to authenticated,service_role;

comment on table public.competition_ranking_entry_totals is 'Proyección atómica por entrada; se refresca únicamente para scopes afectados por inserts del Ledger.';
commit;
