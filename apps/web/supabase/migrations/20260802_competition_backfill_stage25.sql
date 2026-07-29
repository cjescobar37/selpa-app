begin;

do $$
begin
  if to_regclass('public.competition_player_entries') is null
     or to_regprocedure('public.assign_player_to_competition_division(uuid,uuid,uuid,text,text,timestamp with time zone)') is null then
    raise exception 'Primero deben aplicarse y validarse las Etapas 1 y 2 del motor competitivo.';
  end if;
end
$$;

create table if not exists public.competition_backfill_batches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  season_id uuid not null,
  status text not null default 'DRAFT',
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  constraint competition_backfill_batches_season_fkey foreign key (club_id, season_id)
    references public.competition_seasons(club_id, id) on delete restrict,
  constraint competition_backfill_batches_status_chk check (
    status in ('DRAFT', 'REVIEWED', 'APPROVED', 'EXECUTED', 'CANCELLED', 'FAILED')
  ),
  constraint competition_backfill_batches_metadata_chk check (jsonb_typeof(metadata) = 'object'),
  constraint competition_backfill_batches_approval_chk check (
    (status in ('DRAFT', 'REVIEWED', 'CANCELLED', 'FAILED'))
    or (approved_by is not null and approved_at is not null)
  ),
  constraint competition_backfill_batches_execution_chk check (
    status <> 'EXECUTED' or executed_at is not null
  ),
  constraint competition_backfill_batches_club_id_id_key unique (club_id, id)
);

create unique index if not exists competition_backfill_batches_open_uidx
  on public.competition_backfill_batches (club_id, season_id)
  where status in ('DRAFT', 'REVIEWED', 'APPROVED');
create index if not exists competition_backfill_batches_club_season_idx
  on public.competition_backfill_batches (club_id, season_id, created_at desc);
create index if not exists competition_backfill_batches_status_idx
  on public.competition_backfill_batches (status, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint constraint_info
    where constraint_info.conrelid = 'public.competition_player_entries'::regclass
      and constraint_info.conname = 'competition_player_entries_club_id_id_key'
  ) then
    alter table public.competition_player_entries
      add constraint competition_player_entries_club_id_id_key unique (club_id, id);
  end if;
end
$$;

create table if not exists public.competition_backfill_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  club_id uuid not null,
  club_player_id uuid not null,
  proposed_division_id uuid,
  diagnostic_status text not null,
  decision text not null default 'PENDING',
  decision_reason text,
  executed_entry_id uuid,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_backfill_items_batch_fkey foreign key (club_id, batch_id)
    references public.competition_backfill_batches(club_id, id) on delete restrict,
  constraint competition_backfill_items_player_fkey foreign key (club_id, club_player_id)
    references public.club_players(club_id, id) on delete restrict,
  constraint competition_backfill_items_division_fkey foreign key (club_id, proposed_division_id)
    references public.competition_divisions(club_id, id) on delete restrict,
  constraint competition_backfill_items_entry_fkey foreign key (club_id, executed_entry_id)
    references public.competition_player_entries(club_id, id) on delete restrict,
  constraint competition_backfill_items_decision_chk check (
    decision in ('PENDING', 'APPROVED', 'SKIPPED', 'REJECTED', 'EXECUTED', 'FAILED')
  ),
  constraint competition_backfill_items_diagnostic_chk check (
    diagnostic_status in (
      'READY', 'ALREADY_ASSIGNED', 'MISSING_SEASON', 'MISSING_BRANCH',
      'MISSING_CATEGORY', 'MISSING_DIVISION', 'AMBIGUOUS_DIVISION',
      'INVALID_LEGACY_GENDER', 'INVALID_LEGACY_CATEGORY', 'MULTIPLE_ACTIVE_SEASONS',
      'MULTIPLE_CANDIDATE_BRANCHES', 'DUPLICATE_USER_MEMBERSHIP', 'MANUAL_REVIEW'
    )
  ),
  constraint competition_backfill_items_approved_division_chk check (
    decision not in ('APPROVED', 'EXECUTED') or proposed_division_id is not null
  ),
  constraint competition_backfill_items_executed_entry_chk check (
    decision <> 'EXECUTED' or executed_entry_id is not null
  ),
  constraint competition_backfill_items_metadata_chk check (jsonb_typeof(metadata) = 'object'),
  constraint competition_backfill_items_batch_player_key unique (batch_id, club_player_id)
);

create index if not exists competition_backfill_items_batch_idx
  on public.competition_backfill_batch_items (batch_id, decision, created_at);
create index if not exists competition_backfill_items_player_idx
  on public.competition_backfill_batch_items (club_id, club_player_id);
create index if not exists competition_backfill_items_decision_idx
  on public.competition_backfill_batch_items (decision);
create index if not exists competition_backfill_items_entry_idx
  on public.competition_backfill_batch_items (executed_entry_id)
  where executed_entry_id is not null;

create or replace function public.validate_competition_backfill_item()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare v_season uuid;
begin
  select batch.season_id into v_season from public.competition_backfill_batches batch
  where batch.id=new.batch_id and batch.club_id=new.club_id;
  if not found then raise exception 'El lote no pertenece al club.' using errcode='23503'; end if;
  if new.proposed_division_id is not null and not exists(
    select 1 from public.competition_divisions division
    where division.id=new.proposed_division_id and division.club_id=new.club_id
      and division.season_id=v_season and division.modality='INDIVIDUAL'
  ) then raise exception 'La división propuesta no pertenece al club, temporada o modalidad del lote.' using errcode='23514'; end if;
  if new.executed_entry_id is not null and not exists(
    select 1 from public.competition_player_entries entry
    where entry.id=new.executed_entry_id and entry.club_id=new.club_id and entry.club_player_id=new.club_player_id
  ) then raise exception 'La entrada ejecutada no corresponde al jugador del item.' using errcode='23514'; end if;
  return new;
end; $$;

drop trigger if exists trg_validate_competition_backfill_item on public.competition_backfill_batch_items;
create trigger trg_validate_competition_backfill_item before insert or update of batch_id,club_id,club_player_id,proposed_division_id,executed_entry_id
on public.competition_backfill_batch_items for each row execute function public.validate_competition_backfill_item();

create or replace function public.protect_executed_competition_backfill_batch()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.status='EXECUTED' then
    raise exception 'Un lote ejecutado no puede eliminarse.' using errcode='23514';
  end if;
  return old;
end; $$;

drop trigger if exists trg_protect_executed_competition_backfill_batch on public.competition_backfill_batches;
create trigger trg_protect_executed_competition_backfill_batch
  before delete on public.competition_backfill_batches
  for each row execute function public.protect_executed_competition_backfill_batch();

drop trigger if exists trg_competition_backfill_items_updated_at on public.competition_backfill_batch_items;
create trigger trg_competition_backfill_items_updated_at
  before update on public.competition_backfill_batch_items
  for each row execute function public.set_updated_at();

create or replace function public.ensure_competition_division(
  p_club_id uuid,
  p_season_id uuid,
  p_modality text,
  p_branch_id uuid,
  p_segment_id uuid default null,
  p_category_id uuid default null,
  p_name text default null
)
returns public.competition_divisions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_modality text := upper(btrim(coalesce(p_modality, '')));
  v_result public.competition_divisions%rowtype;
begin
  if v_actor is null then raise exception 'Sesión inválida.' using errcode = '28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'ranking:manage') then
    raise exception 'No tenés permisos para gestionar divisiones.' using errcode = '42501';
  end if;
  if v_modality not in ('INDIVIDUAL', 'PAIRS') then
    raise exception 'Modalidad inválida.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.competition_seasons season
    where season.id = p_season_id and season.club_id = p_club_id and season.status in ('DRAFT', 'ACTIVE')
  ) then raise exception 'La temporada no pertenece al club o no admite divisiones.' using errcode = '22023'; end if;
  if not exists (select 1 from public.competition_branches branch where branch.id = p_branch_id and branch.club_id = p_club_id) then
    raise exception 'La rama no pertenece al club.' using errcode = '22023';
  end if;
  if p_segment_id is not null and not exists (select 1 from public.competition_segments segment where segment.id = p_segment_id and segment.club_id = p_club_id) then
    raise exception 'El segmento no pertenece al club.' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (select 1 from public.competition_categories category where category.id = p_category_id and category.club_id = p_club_id) then
    raise exception 'La categoría no pertenece al club.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':', p_season_id::text, v_modality, p_branch_id::text, coalesce(p_segment_id::text, '(NULL)'), coalesce(p_category_id::text, '(NULL)')), 0));
  select division.* into v_result
  from public.competition_divisions division
  where division.season_id = p_season_id and division.modality = v_modality
    and division.branch_id = p_branch_id
    and division.segment_id is not distinct from p_segment_id
    and division.category_id is not distinct from p_category_id
  limit 1;
  if found then return v_result; end if;

  insert into public.competition_divisions (
    club_id, season_id, modality, branch_id, segment_id, category_id, name_override
  ) values (
    p_club_id, p_season_id, v_modality, p_branch_id, p_segment_id, p_category_id,
    nullif(btrim(coalesce(p_name, '')), '')
  ) returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.get_competition_backfill_diagnostic(
  p_club_id uuid,
  p_season_id uuid default null
)
returns table(
  club_id uuid, club_player_id uuid, user_id uuid, player_name text,
  legacy_gender text, legacy_category integer, ranking_points numeric,
  active_season_id uuid, candidate_branch_id uuid, candidate_branch text,
  candidate_category_id uuid, candidate_category text, candidate_division_id uuid,
  candidate_division_count bigint, existing_entry_id uuid,
  diagnostic_status text, diagnostic_detail text
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'ranking:view') then
    raise exception 'No tenés permisos para diagnosticar el ranking.' using errcode='42501';
  end if;
  return query
  with players as (
    select player.id, player.club_id, player.user_id, player.gender,
      player.category::integer as legacy_category,
      case when (to_jsonb(player)->>'ranking_points') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (to_jsonb(player)->>'ranking_points')::numeric end as points,
      coalesce(nullif(profile.display_name,''), nullif(btrim(concat_ws(' ',profile.first_name,profile.last_name)),''), 'Jugador') as player_name,
      (select count(*) from public.club_memberships membership
       where membership.club_id=player.club_id and membership.user_id=player.user_id) as membership_count
    from public.club_players player
    left join public.profiles profile on profile.user_id=player.user_id
    where player.club_id=p_club_id
  ), season_state as (
    select
      (select count(*) from public.competition_seasons season
       where season.club_id=p_club_id and season.status='ACTIVE') as active_count,
      coalesce(p_season_id,(
        select season.id from public.competition_seasons season
        where season.club_id=p_club_id and season.status='ACTIVE'
        order by season.id limit 1
      )) as selected_id
  ), mapped as (
    select players.*, season_state.active_count, season_state.selected_id,
      case when upper(btrim(players.gender))='M' then 'caballeros'
           when upper(btrim(players.gender))='F' then 'damas' end as branch_slug
    from players cross join season_state
  ), candidates as (
    select mapped.*,
      (select count(*) from public.competition_branches branch where branch.club_id=p_club_id and branch.slug=mapped.branch_slug and branch.is_active) as branch_count,
      (select branch.id from public.competition_branches branch where branch.club_id=p_club_id and branch.slug=mapped.branch_slug and branch.is_active order by branch.id limit 1) as branch_id,
      (select branch.name from public.competition_branches branch where branch.club_id=p_club_id and branch.slug=mapped.branch_slug and branch.is_active order by branch.id limit 1) as branch_name,
      (select count(*) from public.competition_categories category where category.club_id=p_club_id and category.legacy_category_id=mapped.legacy_category and category.is_active) as category_count,
      (select category.id from public.competition_categories category where category.club_id=p_club_id and category.legacy_category_id=mapped.legacy_category and category.is_active order by category.id limit 1) as category_id,
      (select category.name from public.competition_categories category where category.club_id=p_club_id and category.legacy_category_id=mapped.legacy_category and category.is_active order by category.id limit 1) as category_name
    from mapped
  ), resolved as (
    select candidates.*,
      (select count(*) from public.competition_divisions division
       where division.club_id=p_club_id and division.season_id=candidates.selected_id
         and division.modality='INDIVIDUAL' and division.branch_id=candidates.branch_id
         and division.segment_id is null and division.category_id=candidates.category_id and division.is_active) as division_count,
      (select division.id from public.competition_divisions division
       where division.club_id=p_club_id and division.season_id=candidates.selected_id
         and division.modality='INDIVIDUAL' and division.branch_id=candidates.branch_id
         and division.segment_id is null and division.category_id=candidates.category_id and division.is_active
       order by division.id limit 1) as division_id,
      (select entry.id from public.competition_player_entries entry
       join public.competition_divisions division on division.id=entry.division_id and division.club_id=entry.club_id
       where entry.club_id=p_club_id and entry.club_player_id=candidates.id
         and division.season_id=candidates.selected_id and entry.valid_until is null
         and entry.status in ('ACTIVE','SUSPENDED')
       order by entry.id limit 1) as existing_id
    from candidates
  )
  select resolved.club_id,resolved.id,resolved.user_id,resolved.player_name,resolved.gender,
    resolved.legacy_category,resolved.points,resolved.selected_id,resolved.branch_id,resolved.branch_name,
    resolved.category_id,resolved.category_name,resolved.division_id,resolved.division_count,resolved.existing_id,
    case
      when resolved.membership_count > 1 then 'DUPLICATE_USER_MEMBERSHIP'
      when p_season_id is null and resolved.active_count > 1 then 'MULTIPLE_ACTIVE_SEASONS'
      when resolved.selected_id is null then 'MISSING_SEASON'
      when upper(btrim(coalesce(resolved.gender,''))) not in ('M','F') then 'INVALID_LEGACY_GENDER'
      when resolved.legacy_category is null or resolved.legacy_category not between 1 and 7 then 'INVALID_LEGACY_CATEGORY'
      when resolved.branch_count > 1 then 'MULTIPLE_CANDIDATE_BRANCHES'
      when resolved.branch_count = 0 then 'MISSING_BRANCH'
      when resolved.category_count = 0 then 'MISSING_CATEGORY'
      when resolved.category_count > 1 then 'MANUAL_REVIEW'
      when resolved.existing_id is not null then 'ALREADY_ASSIGNED'
      when resolved.division_count = 0 then 'MISSING_DIVISION'
      when resolved.division_count > 1 then 'AMBIGUOUS_DIVISION'
      else 'READY' end,
    case
      when resolved.membership_count > 1 then 'El user_id posee más de una membership en el club.'
      when p_season_id is null and resolved.active_count > 1 then 'Existe más de una temporada ACTIVE.'
      when resolved.selected_id is null then 'No existe temporada ACTIVE seleccionable.'
      when upper(btrim(coalesce(resolved.gender,''))) not in ('M','F') then 'gender legacy no es M ni F.'
      when resolved.legacy_category is null or resolved.legacy_category not between 1 and 7 then 'category legacy no está entre 1 y 7.'
      when resolved.branch_count > 1 then 'Existe más de una rama candidata activa.'
      when resolved.branch_count = 0 then 'No existe la rama legacy candidata.'
      when resolved.category_count = 0 then 'No existe la categoría legacy candidata.'
      when resolved.category_count > 1 then 'La categoría legacy tiene más de una candidata.'
      when resolved.existing_id is not null then 'El jugador ya tiene una entrada vigente en la temporada.'
      when resolved.division_count = 0 then 'No existe la división individual sin segmento.'
      when resolved.division_count > 1 then 'Existe más de una división candidata.'
      else 'Mapeo legacy inequívoco.' end
  from resolved order by resolved.player_name,resolved.id;
end;
$$;

create or replace function public.create_competition_backfill_batch(p_club_id uuid,p_season_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid(); v_batch uuid; v_row record;
begin
  if v_actor is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'ranking:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if not exists(select 1 from public.competition_seasons season where season.id=p_season_id and season.club_id=p_club_id and season.status='ACTIVE') then
    raise exception 'El lote requiere una temporada ACTIVE del club.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text||':backfill:'||p_season_id::text,0));
  select batch.id into v_batch from public.competition_backfill_batches batch
  where batch.club_id=p_club_id and batch.season_id=p_season_id and batch.status in ('DRAFT','REVIEWED','APPROVED') limit 1;
  if v_batch is null then
    insert into public.competition_backfill_batches(club_id,season_id,created_by)
    values(p_club_id,p_season_id,v_actor) returning id into v_batch;
    for v_row in select * from public.get_competition_backfill_diagnostic(p_club_id,p_season_id) loop
      insert into public.competition_backfill_batch_items(
        batch_id,club_id,club_player_id,proposed_division_id,diagnostic_status,decision,decision_reason,metadata
      ) values (
        v_batch,p_club_id,v_row.club_player_id,v_row.candidate_division_id,v_row.diagnostic_status,
        case when v_row.diagnostic_status='READY' then 'APPROVED' when v_row.diagnostic_status='ALREADY_ASSIGNED' then 'SKIPPED' else 'PENDING' end,
        v_row.diagnostic_detail,
        jsonb_build_object('diagnosed_at',now(),'diagnosed_by',v_actor)
      );
    end loop;
  end if;
  return jsonb_build_object('batch_id',v_batch,'summary',(
    select coalesce(jsonb_object_agg(summary.decision,summary.amount),'{}'::jsonb)
    from (select item.decision,count(*) as amount from public.competition_backfill_batch_items item where item.batch_id=v_batch group by item.decision) summary
  ));
end; $$;

create or replace function public.approve_competition_backfill_batch(p_batch_id uuid,p_notes text default null)
returns public.competition_backfill_batches language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid(); v_batch public.competition_backfill_batches%rowtype; v_result public.competition_backfill_batches%rowtype;
begin
  select batch.* into v_batch from public.competition_backfill_batches batch where batch.id=p_batch_id for update;
  if not found then raise exception 'Lote inexistente.' using errcode='22023'; end if;
  if v_actor is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(v_batch.club_id,'ranking:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if v_batch.status not in ('DRAFT','REVIEWED') then raise exception 'El lote no puede aprobarse.' using errcode='23514'; end if;
  if exists(select 1 from public.competition_backfill_batch_items item where item.batch_id=p_batch_id and item.decision='PENDING') then
    raise exception 'El lote contiene items pendientes.' using errcode='23514';
  end if;
  update public.competition_backfill_batches batch set status='APPROVED',approved_by=v_actor,approved_at=now(),notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),batch.notes)
  where batch.id=p_batch_id returning * into v_result;
  return v_result;
end; $$;

create or replace function public.execute_competition_backfill_batch(p_batch_id uuid)
returns public.competition_backfill_batches language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid(); v_batch public.competition_backfill_batches%rowtype; v_item record; v_entry public.competition_player_entries%rowtype; v_result public.competition_backfill_batches%rowtype; v_effective timestamptz:=now();
begin
  select batch.* into v_batch from public.competition_backfill_batches batch where batch.id=p_batch_id for update;
  if not found then raise exception 'Lote inexistente.' using errcode='22023'; end if;
  if v_actor is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(v_batch.club_id,'ranking:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if v_batch.status='EXECUTED' then return v_batch; end if;
  if v_batch.status<>'APPROVED' then raise exception 'Solo puede ejecutarse un lote APPROVED.' using errcode='23514'; end if;
  if exists(select 1 from public.competition_backfill_batch_items item where item.batch_id=p_batch_id and item.decision not in ('APPROVED','SKIPPED','REJECTED')) then
    raise exception 'El lote contiene decisiones no ejecutables.' using errcode='23514';
  end if;
  for v_item in select item.* from public.competition_backfill_batch_items item where item.batch_id=p_batch_id and item.decision='APPROVED' order by item.created_at,item.id for update loop
    v_entry:=public.assign_player_to_competition_division(v_item.club_id,v_item.club_player_id,v_item.proposed_division_id,'LEGACY_BACKFILL',coalesce(v_item.decision_reason,'Backfill legacy controlado'),v_effective);
    update public.competition_backfill_batch_items item set decision='EXECUTED',executed_entry_id=v_entry.id,error_message=null,
      metadata=item.metadata||jsonb_build_object('executed_at',v_effective,'executed_by',v_actor)
    where item.id=v_item.id;
  end loop;
  update public.competition_backfill_batches batch set status='EXECUTED',executed_at=v_effective,
    metadata=batch.metadata||jsonb_build_object('executed_by',v_actor)
  where batch.id=p_batch_id returning * into v_result;
  return v_result;
exception when others then
  raise;
end; $$;

alter table public.competition_backfill_batches enable row level security;
alter table public.competition_backfill_batch_items enable row level security;
revoke all on table public.competition_backfill_batches from anon,authenticated;
revoke all on table public.competition_backfill_batch_items from anon,authenticated;
grant select on table public.competition_backfill_batches to authenticated;
grant select on table public.competition_backfill_batch_items to authenticated;
grant all on table public.competition_backfill_batches to service_role;
grant all on table public.competition_backfill_batch_items to service_role;

drop policy if exists competition_backfill_batches_read on public.competition_backfill_batches;
create policy competition_backfill_batches_read on public.competition_backfill_batches for select to authenticated
using(public.is_platform_admin() or public.has_club_capability(club_id,'ranking:view'));
drop policy if exists competition_backfill_items_read on public.competition_backfill_batch_items;
create policy competition_backfill_items_read on public.competition_backfill_batch_items for select to authenticated
using(public.is_platform_admin() or public.has_club_capability(club_id,'ranking:view'));

revoke all on function public.ensure_competition_division(uuid,uuid,text,uuid,uuid,uuid,text) from public,anon;
revoke all on function public.protect_executed_competition_backfill_batch() from public,anon,authenticated;
revoke all on function public.validate_competition_backfill_item() from public,anon,authenticated;
revoke all on function public.get_competition_backfill_diagnostic(uuid,uuid) from public,anon;
revoke all on function public.create_competition_backfill_batch(uuid,uuid) from public,anon;
revoke all on function public.approve_competition_backfill_batch(uuid,text) from public,anon;
revoke all on function public.execute_competition_backfill_batch(uuid) from public,anon;
grant execute on function public.ensure_competition_division(uuid,uuid,text,uuid,uuid,uuid,text) to authenticated,service_role;
grant execute on function public.protect_executed_competition_backfill_batch() to service_role;
grant execute on function public.validate_competition_backfill_item() to service_role;
grant execute on function public.get_competition_backfill_diagnostic(uuid,uuid) to authenticated,service_role;
grant execute on function public.create_competition_backfill_batch(uuid,uuid) to authenticated,service_role;
grant execute on function public.approve_competition_backfill_batch(uuid,text) to authenticated,service_role;
grant execute on function public.execute_competition_backfill_batch(uuid) to authenticated,service_role;

comment on table public.competition_backfill_batches is 'Lotes revisables para migración controlada de jugadores legacy al motor competitivo.';
comment on table public.competition_backfill_batch_items is 'Decisión por club_player_id; nunca usa nombre como identidad ni almacena puntos.';
comment on function public.ensure_competition_division(uuid,uuid,text,uuid,uuid,uuid,text) is 'Crea o reutiliza una división equivalente; competition_divisions no posee slug propio.';
comment on function public.execute_competition_backfill_batch(uuid) is 'Ejecución completamente transaccional mediante assign_player_to_competition_division; un error revierte el lote completo.';

create or replace function public.review_competition_backfill_item(p_item_id uuid,p_decision text,p_division_id uuid default null,p_reason text default null)
returns public.competition_backfill_batch_items language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid(); v_decision text:=upper(btrim(coalesce(p_decision,''))); v_item public.competition_backfill_batch_items%rowtype; v_batch public.competition_backfill_batches%rowtype; v_result public.competition_backfill_batch_items%rowtype;
begin
  select item.* into v_item from public.competition_backfill_batch_items item where item.id=p_item_id for update;
  if not found then raise exception 'Item inexistente.' using errcode='22023'; end if;
  select batch.* into v_batch from public.competition_backfill_batches batch where batch.id=v_item.batch_id for update;
  if v_actor is null then raise exception 'Sesión inválida.' using errcode='28000'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(v_item.club_id,'ranking:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if v_batch.status not in ('DRAFT','REVIEWED') or v_item.decision='EXECUTED' then raise exception 'El item ya no puede revisarse.' using errcode='23514'; end if;
  if v_decision not in ('APPROVED','SKIPPED','REJECTED') then raise exception 'Decisión inválida.' using errcode='22023'; end if;
  if v_decision='APPROVED' then
    if p_division_id is null then raise exception 'La división es obligatoria.' using errcode='22023'; end if;
    if not exists(select 1 from public.competition_divisions division where division.id=p_division_id and division.club_id=v_item.club_id and division.season_id=v_batch.season_id and division.modality='INDIVIDUAL' and division.is_active) then
      raise exception 'La división no es válida para este lote.' using errcode='22023';
    end if;
    if not exists(select 1 from public.club_players player where player.id=v_item.club_player_id and player.club_id=v_item.club_id) then raise exception 'Jugador ajeno al club.' using errcode='22023'; end if;
  end if;
  update public.competition_backfill_batch_items item set decision=v_decision,
    proposed_division_id=case when v_decision='APPROVED' then p_division_id else item.proposed_division_id end,
    decision_reason=nullif(btrim(coalesce(p_reason,'')),''),
    metadata=item.metadata||jsonb_build_object('reviewed_at',now(),'reviewed_by',v_actor)
  where item.id=p_item_id returning * into v_result;
  update public.competition_backfill_batches batch set status='REVIEWED' where batch.id=v_batch.id and batch.status='DRAFT';
  return v_result;
end; $$;

create or replace function public.initialize_club_competition_season(
  p_club_id uuid,
  p_year integer,
  p_template text default 'PADEL_TRADITIONAL',
  p_create_default_divisions boolean default false
)
returns table(
  season_id uuid,
  branch_count integer,
  segment_count integer,
  category_count integer,
  divisions_created integer,
  divisions_reused integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_template text := upper(btrim(coalesce(p_template, '')));
  v_season uuid;
  v_branch uuid;
  v_category uuid;
  v_before integer;
  v_created integer := 0;
  v_reused integer := 0;
begin
  if v_actor is null then raise exception 'Sesión inválida.' using errcode = '28000'; end if;
  if p_year not between 2000 and 2200 then raise exception 'Año inválido.' using errcode = '22023'; end if;
  if v_template <> 'PADEL_TRADITIONAL' then raise exception 'Plantilla desconocida.' using errcode = '22023'; end if;
  if not exists (select 1 from public.clubs club where club.id = p_club_id) then raise exception 'Club inexistente.' using errcode = '22023'; end if;
  if not public.is_platform_admin() and not public.has_club_capability(p_club_id, 'ranking:manage') then
    raise exception 'No tenés permisos para inicializar la competencia.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text || ':season:' || p_year::text, 0));
  insert into public.competition_seasons (club_id, name, starts_on, ends_on, status, created_by)
  values (p_club_id, p_year::text, make_date(p_year,1,1), make_date(p_year,12,31), 'DRAFT', v_actor)
  on conflict (club_id, name) do nothing returning id into v_season;
  if v_season is null then
    select season.id into v_season from public.competition_seasons season
    where season.club_id = p_club_id and season.name = p_year::text;
  end if;

  insert into public.competition_branches (club_id, name, slug, accent_kind, sort_order) values
    (p_club_id,'Caballeros','caballeros','CYAN',10),
    (p_club_id,'Damas','damas','MAGENTA',20),
    (p_club_id,'Mixto','mixto','MIXED',30)
  on conflict (club_id,slug) do nothing;
  insert into public.competition_segments (club_id,name,slug,sort_order) values
    (p_club_id,'Libres','libres',10),(p_club_id,'Veteranos','veteranos',20),(p_club_id,'Menores','menores',30)
  on conflict (club_id,slug) do nothing;
  insert into public.competition_categories (club_id,name,short_label,slug,legacy_category_id,sort_order) values
    (p_club_id,'1ª','1ª','1a',1,10),(p_club_id,'2ª','2ª','2a',2,20),
    (p_club_id,'3ª','3ª','3a',3,30),(p_club_id,'4ª','4ª','4a',4,40),
    (p_club_id,'5ª','5ª','5a',5,50),(p_club_id,'6ª','6ª','6a',6,60),
    (p_club_id,'7ª','7ª','7a',7,70)
  on conflict (club_id,slug) do nothing;

  if p_create_default_divisions then
    select branch.id into v_branch from public.competition_branches branch
    where branch.club_id = p_club_id and branch.slug = 'caballeros';
    for v_category in select category.id from public.competition_categories category
      where category.club_id = p_club_id and category.legacy_category_id between 1 and 7 order by category.legacy_category_id
    loop
      select count(*) into v_before from public.competition_divisions division
      where division.season_id = v_season and division.modality = 'INDIVIDUAL'
        and division.branch_id = v_branch and division.segment_id is null and division.category_id = v_category;
      perform public.ensure_competition_division(p_club_id,v_season,'INDIVIDUAL',v_branch,null,v_category);
      if v_before = 0 then v_created := v_created + 1; else v_reused := v_reused + 1; end if;
    end loop;
  end if;

  return query select v_season,
    (select count(*)::integer from public.competition_branches branch where branch.club_id=p_club_id),
    (select count(*)::integer from public.competition_segments segment where segment.club_id=p_club_id),
    (select count(*)::integer from public.competition_categories category where category.club_id=p_club_id),
    v_created, v_reused;
end;
$$;

revoke all on function public.initialize_club_competition_season(uuid,integer,text,boolean) from public,anon;
revoke all on function public.review_competition_backfill_item(uuid,text,uuid,text) from public,anon;
grant execute on function public.initialize_club_competition_season(uuid,integer,text,boolean) to authenticated,service_role;
grant execute on function public.review_competition_backfill_item(uuid,text,uuid,text) to authenticated,service_role;

commit;
