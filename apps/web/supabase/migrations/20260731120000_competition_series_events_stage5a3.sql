begin;

do $$ begin
  if to_regclass('public.competition_series') is null
     or to_regclass('public.competition_series_rules') is null
     or to_regclass('public.competition_event_tiers') is null
     or to_regclass('public.tournaments') is null then
    raise exception 'Stage 5A.3 requiere Stages 1-5A.2 y tournaments.';
  end if;
end $$;

create table public.competition_series_events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  series_id uuid not null,
  season_id uuid not null,
  name text not null,
  event_type text not null default 'STANDARD',
  event_number integer,
  sequence integer not null,
  status text not null default 'DRAFT',
  planned_starts_at timestamptz,
  planned_ends_at timestamptz,
  actual_starts_at timestamptz,
  actual_ends_at timestamptz,
  timezone text,
  venue_name text,
  venue_address text,
  is_public boolean not null default false,
  revision integer not null default 1,
  scheduled_by uuid references auth.users(id) on delete restrict,
  scheduled_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  archived_by uuid references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_series_events_series_fkey foreign key (club_id,series_id)
    references public.competition_series(club_id,id) on delete restrict,
  constraint competition_series_events_season_fkey foreign key (club_id,season_id)
    references public.competition_seasons(club_id,id) on delete restrict,
  constraint competition_series_events_name_chk check (length(btrim(name))>0),
  constraint competition_series_events_type_chk check (event_type in ('STANDARD','EXHIBITION','FRIENDLY')),
  constraint competition_series_events_number_chk check (event_number is null or event_number>0),
  constraint competition_series_events_sequence_chk check (sequence>0),
  constraint competition_series_events_status_chk check (status in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
  constraint competition_series_events_planned_dates_chk check (planned_ends_at is null or planned_starts_at is null or planned_ends_at>=planned_starts_at),
  constraint competition_series_events_actual_dates_chk check (actual_ends_at is null or actual_starts_at is null or actual_ends_at>=actual_starts_at),
  constraint competition_series_events_actual_pair_chk check ((actual_starts_at is null)=(actual_ends_at is null)),
  constraint competition_series_events_revision_chk check (revision>0),
  constraint competition_series_events_lifecycle_chk check (
    (status='DRAFT' and scheduled_at is null and scheduled_by is null and completed_at is null and completed_by is null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='SCHEDULED' and scheduled_at is not null and scheduled_by is not null and completed_at is null and completed_by is null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='COMPLETED' and scheduled_at is not null and scheduled_by is not null and completed_at is not null and completed_by is not null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='CANCELLED' and cancelled_at is not null and cancelled_by is not null and length(btrim(coalesce(cancellation_reason,'')))>0 and completed_at is null and completed_by is null)
  ),
  constraint competition_series_events_archive_chk check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null and status in ('COMPLETED','CANCELLED'))
  ),
  constraint competition_series_events_club_id_id_key unique(club_id,id),
  constraint competition_series_events_series_sequence_key unique(series_id,sequence)
);
create unique index competition_series_events_number_uidx on public.competition_series_events(series_id,event_number) where event_number is not null;
create index competition_series_events_list_idx on public.competition_series_events(club_id,series_id,status,sequence) where archived_at is null;

create table public.competition_series_event_divisions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  series_division_id uuid not null,
  series_rule_id uuid not null,
  event_tier_id uuid,
  scoring_mode text,
  points_scheme_override_id uuid references public.points_schemes(id) on delete restrict,
  points_multiplier_override numeric(10,4),
  status text not null default 'DRAFT',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete restrict,
  removal_reason text,
  configuration_snapshot jsonb,
  frozen_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  revision integer not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_event_divisions_event_fkey foreign key(club_id,event_id)
    references public.competition_series_events(club_id,id) on delete restrict,
  constraint competition_event_divisions_series_division_fkey foreign key(club_id,series_division_id)
    references public.competition_series_divisions(club_id,id) on delete restrict,
  constraint competition_event_divisions_rule_fkey foreign key(club_id,series_rule_id)
    references public.competition_series_rules(club_id,id) on delete restrict,
  constraint competition_event_divisions_tier_fkey foreign key(club_id,event_tier_id)
    references public.competition_event_tiers(club_id,id) on delete restrict,
  constraint competition_event_divisions_scoring_chk check (scoring_mode is null or scoring_mode in ('POINTS','NON_SCORING')),
  constraint competition_event_divisions_multiplier_chk check (points_multiplier_override is null or points_multiplier_override>0),
  constraint competition_event_divisions_status_chk check(status in ('DRAFT','SCHEDULED','COMPLETED','CANCELLED')),
  constraint competition_event_divisions_removal_chk check ((is_active and removed_at is null and removed_by is null and removal_reason is null) or (not is_active and removed_at is not null and removed_by is not null and length(btrim(coalesce(removal_reason,'')))>0)),
  constraint competition_event_divisions_snapshot_chk check(configuration_snapshot is null or jsonb_typeof(configuration_snapshot)='object'),
  constraint competition_event_divisions_lifecycle_chk check(
    (status='DRAFT' and frozen_at is null and configuration_snapshot is null and completed_at is null and completed_by is null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='SCHEDULED' and frozen_at is not null and configuration_snapshot is not null and completed_at is null and completed_by is null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='COMPLETED' and frozen_at is not null and configuration_snapshot is not null and completed_at is not null and completed_by is not null and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or (status='CANCELLED' and cancelled_at is not null and cancelled_by is not null and length(btrim(coalesce(cancellation_reason,'')))>0 and completed_at is null and completed_by is null)
  ),
  constraint competition_event_divisions_non_scoring_chk check(scoring_mode is distinct from 'NON_SCORING' or (event_tier_id is null and points_scheme_override_id is null and points_multiplier_override is null)),
  constraint competition_event_divisions_revision_chk check(revision>0),
  constraint competition_event_divisions_event_division_key unique(event_id,series_division_id),
  constraint competition_event_divisions_club_id_id_key unique(club_id,id)
);
create index competition_event_divisions_event_idx on public.competition_series_event_divisions(event_id,is_active,sort_order);

create table public.competition_series_event_tournament_links (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  event_division_id uuid not null, tournament_id uuid not null references public.tournaments(id) on delete restrict,
  status text not null default 'ACTIVE', linked_at timestamptz not null default now(), linked_by uuid not null references auth.users(id) on delete restrict,
  ended_at timestamptz, ended_by uuid references auth.users(id) on delete restrict, reason text, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint competition_event_links_division_fkey foreign key(club_id,event_division_id) references public.competition_series_event_divisions(club_id,id) on delete restrict,
  constraint competition_event_links_status_chk check(status in ('ACTIVE','REPLACED','REMOVED')),
  constraint competition_event_links_end_chk check((status='ACTIVE' and ended_at is null and ended_by is null) or (status<>'ACTIVE' and ended_at is not null and ended_by is not null)),
  constraint competition_event_links_reason_chk check(status='ACTIVE' or length(btrim(coalesce(reason,'')))>0),
  constraint competition_event_links_revision_chk check(revision>0)
);
create unique index competition_event_links_active_division_uidx on public.competition_series_event_tournament_links(event_division_id) where status='ACTIVE';
create unique index competition_event_links_active_tournament_uidx on public.competition_series_event_tournament_links(tournament_id) where status='ACTIVE';
create index competition_event_links_history_idx on public.competition_series_event_tournament_links(event_division_id,created_at desc);

create table public.competition_series_event_schedule_history (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null, previous_planned_starts_at timestamptz, previous_planned_ends_at timestamptz,
  new_planned_starts_at timestamptz not null, new_planned_ends_at timestamptz not null,
  previous_timezone text, new_timezone text not null, previous_venue_name text, new_venue_name text,
  previous_venue_address text, new_venue_address text, reason text not null,
  changed_by uuid not null references auth.users(id) on delete restrict, changed_at timestamptz not null default now(),
  resulting_event_revision integer not null,
  constraint competition_event_history_event_fkey foreign key(club_id,event_id) references public.competition_series_events(club_id,id) on delete restrict,
  constraint competition_event_history_dates_chk check(new_planned_ends_at>=new_planned_starts_at),
  constraint competition_event_history_reason_chk check(length(btrim(reason))>0),
  constraint competition_event_history_revision_chk check(resulting_event_revision>1)
);
create index competition_event_history_event_idx on public.competition_series_event_schedule_history(event_id,changed_at desc);

create table public.competition_series_event_commands (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict, event_id uuid not null,
  operation text not null, idempotency_key text not null, request_hash text not null, response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint competition_event_commands_event_fkey foreign key(club_id,event_id) references public.competition_series_events(club_id,id) on delete restrict,
  constraint competition_event_commands_operation_chk check(length(btrim(operation))>0),
  constraint competition_event_commands_key_chk check(length(btrim(idempotency_key)) between 8 and 200),
  constraint competition_event_commands_hash_chk check(request_hash ~ '^[0-9a-f]{64}$'),
  constraint competition_event_commands_response_chk check(response_payload is null or jsonb_typeof(response_payload)='object'),
  constraint competition_event_commands_scope_key unique(club_id,event_id,actor_id,operation,idempotency_key)
);
create index competition_event_commands_retention_idx on public.competition_series_event_commands(created_at);

create or replace function public.require_competition_event_access(p_club_id uuid,p_lifecycle boolean default false)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid(); v_role text;
begin
  if v_actor is null then raise exception 'Sesión requerida.' using errcode='28000'; end if;
  if public.is_platform_admin() then return v_actor; end if;
  if not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if p_lifecycle then
    select m.role::text into v_role from public.club_memberships m where m.club_id=p_club_id and m.user_id=v_actor and m.status='APPROVED' and m.approved_at is not null;
    if v_role not in ('OWNER','ADMIN') then raise exception 'Solo OWNER o ADMIN.' using errcode='42501'; end if;
  end if;
  return v_actor;
end $$;

create or replace function public.require_competition_event_read_access(p_club_id uuid)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'Sesión requerida.' using errcode='28000'; end if;
  if public.is_platform_admin() or public.has_club_capability(p_club_id,'competition:view') then return v_actor; end if;
  raise exception 'Sin permisos.' using errcode='42501';
end $$;

create or replace function public.require_competition_event_series_state(p_club_id uuid,p_series_id uuid,p_season_id uuid,p_allowed_statuses text[])
returns public.competition_series language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.competition_series%rowtype;
begin
  select * into s from public.competition_series where id=p_series_id and club_id=p_club_id and season_id=p_season_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if s.archived_at is not null or s.status in ('CLOSED','CANCELLED') or not (s.status=any(p_allowed_statuses)) then
    raise exception 'Estado de circuito inválido.' using errcode='23514';
  end if;
  return s;
end $$;

create or replace function public.guard_competition_event_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
  if current_setting('selpa.competition_event_write',true) is distinct from 'allowed' then raise exception 'Use las RPC de Competition Events.' using errcode='42501'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.guard_competition_event_history_append_only()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
  if tg_op<>'INSERT' or current_setting('selpa.competition_event_history_insert',true) is distinct from 'allowed' then
    raise exception 'El historial de planificación es append-only.' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.validate_competition_event_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_series record;
begin
  select s.club_id,s.season_id into v_series from public.competition_series s where s.id=new.series_id;
  if not found or v_series.club_id<>new.club_id or v_series.season_id<>new.season_id then
    raise exception 'EVENT_RELATION_INVALID' using errcode='23514';
  end if;
  if new.status='DRAFT' and (new.actual_starts_at is not null or new.actual_ends_at is not null) then raise exception 'ACTUAL_DATES_NOT_ALLOWED' using errcode='23514'; end if;
  if new.event_type in ('EXHIBITION','FRIENDLY') and exists(select 1 from public.competition_series_event_divisions d where d.event_id=new.id and d.scoring_mode is distinct from 'NON_SCORING') then raise exception 'EVENT_TYPE_SCORING_INVALID' using errcode='23514'; end if;
  if tg_op='UPDATE' then
    if old.status='DRAFT' and new.status='SCHEDULED' and current_setting('selpa.competition_event_schedule',true) is distinct from 'allowed' then raise exception 'EVENT_SCHEDULING_GUARD' using errcode='42501'; end if;
    if row(new.series_id,new.season_id,new.club_id) is distinct from row(old.series_id,old.season_id,old.club_id) then raise exception 'EVENT_SCOPE_IMMUTABLE' using errcode='23514'; end if;
    if row(new.actual_starts_at,new.actual_ends_at) is distinct from row(old.actual_starts_at,old.actual_ends_at)
       and current_setting('selpa.competition_event_lifecycle',true) is distinct from 'allowed' then raise exception 'ACTUAL_DATES_GUARD' using errcode='42501'; end if;
  end if;
  return new;
end $$;

create or replace function public.validate_competition_event_division_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_event record; v_series_division record; v_rule record; v_division record; v_tier record; v_scheme record; v_effective_scheme uuid; v_effective_multiplier numeric;
begin
  select e.club_id,e.series_id,e.season_id,e.event_type into v_event from public.competition_series_events e where e.id=new.event_id;
  select sd.club_id,sd.series_id,sd.division_id into v_series_division from public.competition_series_divisions sd where sd.id=new.series_division_id;
  select r.club_id,r.series_division_id into v_rule from public.competition_series_rules r where r.id=new.series_rule_id;
  select cd.club_id,cd.season_id into v_division from public.competition_divisions cd where cd.id=v_series_division.division_id;
  if v_event.club_id is null or v_series_division.club_id is null or v_rule.club_id is null
     or v_event.club_id<>new.club_id or v_series_division.club_id<>new.club_id or v_rule.club_id<>new.club_id
     or v_event.series_id<>v_series_division.series_id or v_rule.series_division_id<>new.series_division_id
     or v_division.club_id is distinct from new.club_id or v_division.season_id is distinct from v_event.season_id then
    raise exception 'EVENT_DIVISION_RELATION_INVALID' using errcode='23514';
  end if;
  if new.event_tier_id is not null then
    select t.club_id,t.is_active,t.points_multiplier into v_tier from public.competition_event_tiers t where t.id=new.event_tier_id;
    if not found or v_tier.club_id is distinct from new.club_id or not v_tier.is_active then raise exception 'EVENT_TIER_SCOPE_INVALID' using errcode='23514'; end if;
  end if;
  if new.points_scheme_override_id is not null then
    select ps.club_id,ps.is_global,ps.is_active into v_scheme from public.points_schemes ps where ps.id=new.points_scheme_override_id;
    if not found or not v_scheme.is_active or (not v_scheme.is_global and v_scheme.club_id is distinct from new.club_id) then raise exception 'POINTS_SCHEME_SCOPE_INVALID' using errcode='23514'; end if;
  end if;
  if new.scoring_mode='NON_SCORING' and (new.event_tier_id is not null or new.points_scheme_override_id is not null or new.points_multiplier_override is not null) then raise exception 'NON_SCORING_INVALID' using errcode='23514'; end if;
  if new.scoring_mode='POINTS' then
    if v_event.event_type<>'STANDARD' or new.event_tier_id is null then raise exception 'POINTS_CONFIGURATION_INVALID' using errcode='23514'; end if;
    v_effective_scheme:=new.points_scheme_override_id;
    v_effective_multiplier:=coalesce(new.points_multiplier_override,v_tier.points_multiplier);
    if v_effective_scheme is null or v_effective_multiplier is null or v_effective_multiplier<=0
       or not exists(select 1 from public.points_schemes ps where ps.id=v_effective_scheme and ps.is_active and (ps.is_global or ps.club_id=new.club_id)) then
      raise exception 'POINTS_CONFIGURATION_INVALID' using errcode='23514';
    end if;
  end if;
  if v_event.event_type in ('EXHIBITION','FRIENDLY') and new.scoring_mode is distinct from 'NON_SCORING' then raise exception 'EVENT_TYPE_SCORING_INVALID' using errcode='23514'; end if;
  if tg_op='UPDATE' and row(new.event_id,new.club_id,new.series_division_id,new.series_rule_id,new.event_tier_id,new.scoring_mode,new.points_scheme_override_id,new.points_multiplier_override,new.configuration_snapshot,new.frozen_at)
    is distinct from row(old.event_id,old.club_id,old.series_division_id,old.series_rule_id,old.event_tier_id,old.scoring_mode,old.points_scheme_override_id,old.points_multiplier_override,old.configuration_snapshot,old.frozen_at) then
    if old.status<>'DRAFT' or new.status<>'DRAFT' or new.configuration_snapshot is not null or new.frozen_at is not null then
      if current_setting('selpa.competition_event_schedule',true) is distinct from 'allowed'
         or old.status<>'DRAFT' or new.status<>'SCHEDULED'
         or old.configuration_snapshot is not null or old.frozen_at is not null
         or new.configuration_snapshot is null or new.frozen_at is null
         or row(new.event_id,new.club_id,new.series_division_id,new.series_rule_id,new.event_tier_id,new.scoring_mode,new.points_scheme_override_id,new.points_multiplier_override)
            is distinct from row(old.event_id,old.club_id,old.series_division_id,old.series_rule_id,old.event_tier_id,old.scoring_mode,old.points_scheme_override_id,old.points_multiplier_override) then
        raise exception 'EVENT_CONFIGURATION_FROZEN' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function public.validate_competition_event_link_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_division_club uuid; v_tournament_club uuid;
begin
  select d.club_id into v_division_club from public.competition_series_event_divisions d where d.id=new.event_division_id;
  select t.club_id into v_tournament_club from public.tournaments t where t.id=new.tournament_id;
  if v_division_club is distinct from new.club_id or v_tournament_club is distinct from new.club_id then
    raise exception 'TOURNAMENT_LINK_SCOPE_INVALID' using errcode='23514';
  end if;
  return new;
end $$;

create trigger trg_competition_events_guard before insert or update or delete on public.competition_series_events for each row execute function public.guard_competition_event_mutation();
create trigger trg_competition_events_integrity before insert or update on public.competition_series_events for each row execute function public.validate_competition_event_integrity();
create trigger trg_competition_event_divisions_guard before insert or update or delete on public.competition_series_event_divisions for each row execute function public.guard_competition_event_mutation();
create trigger trg_competition_event_divisions_integrity before insert or update on public.competition_series_event_divisions for each row execute function public.validate_competition_event_division_integrity();
create trigger trg_competition_event_links_guard before insert or update or delete on public.competition_series_event_tournament_links for each row execute function public.guard_competition_event_mutation();
create trigger trg_competition_event_links_integrity before insert or update on public.competition_series_event_tournament_links for each row execute function public.validate_competition_event_link_integrity();
create trigger trg_competition_event_history_guard before insert or update or delete on public.competition_series_event_schedule_history for each row execute function public.guard_competition_event_history_append_only();
create trigger trg_competition_event_commands_guard before insert or update or delete on public.competition_series_event_commands for each row execute function public.guard_competition_event_mutation();

create or replace function public.competition_event_begin_command(p_club_id uuid,p_event_id uuid,p_revision integer,p_operation text,p_key text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_event public.competition_series_events%rowtype; v_actor uuid; v_hash text; v_old record;
begin
  select * into v_event from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if;
  v_actor:=public.require_competition_event_access(v_event.club_id,false);
  if p_key is null or length(btrim(p_key)) not between 8 and 200 then raise exception 'Idempotency-Key inválida.' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('event_id',p_event_id,'operation',upper(btrim(p_operation)),'payload',coalesce(p_request,'{}'::jsonb))::text,'UTF8'),'sha256'),'hex');
  select * into v_old from public.competition_series_event_commands c where c.club_id=v_event.club_id and c.event_id=p_event_id and c.actor_id=v_actor and c.operation=upper(btrim(p_operation)) and c.idempotency_key=btrim(p_key);
  if found then
    if v_old.request_hash<>v_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return v_old.response_payload;
  end if;
  if v_event.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  return null;
end $$;

create or replace function public.competition_event_finish_command(p_club_id uuid,p_event_id uuid,p_operation text,p_key text,p_request jsonb,p_response jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_event public.competition_series_events%rowtype; v_actor uuid; v_hash text;
begin
  select * into v_event from public.competition_series_events where id=p_event_id and club_id=p_club_id;
  if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if;
  v_actor:=public.require_competition_event_access(v_event.club_id,false);
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object('event_id',p_event_id,'operation',upper(btrim(p_operation)),'payload',coalesce(p_request,'{}'::jsonb))::text,'UTF8'),'sha256'),'hex');
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_event_commands(club_id,actor_id,event_id,operation,idempotency_key,request_hash,response_payload)
  values(v_event.club_id,v_actor,p_event_id,upper(btrim(p_operation)),btrim(p_key),v_hash,p_response);
end $$;

create or replace function public.create_competition_series_event(p_club_id uuid,p_series_id uuid,p_name text)
returns public.competition_series_events language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_series public.competition_series%rowtype; v_actor uuid; v_result public.competition_series_events%rowtype; v_seq integer;
begin
  v_actor:=public.require_competition_event_access(p_club_id,false);
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  if v_series.status not in ('SCHEDULED','ACTIVE') or v_series.archived_at is not null then raise exception 'Estado de circuito inválido.' using errcode='23514'; end if;
  if length(btrim(coalesce(p_name,'')))=0 then raise exception 'Nombre obligatorio.' using errcode='22023'; end if;
  select coalesce(max(e.sequence),0)+10 into v_seq from public.competition_series_events e where e.series_id=p_series_id;
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_events(club_id,series_id,season_id,name,sequence,created_by)
  values(p_club_id,p_series_id,v_series.season_id,btrim(p_name),v_seq,v_actor) returning * into v_result;
  return v_result;
end $$;

create or replace function public.update_competition_series_event_draft(p_club_id uuid,p_event_id uuid,p_revision integer,p_config jsonb)
returns public.competition_series_events language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; r public.competition_series_events%rowtype; v_type text; v_changed boolean;
begin
  perform public.require_competition_event_access(p_club_id,false);
  select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if;
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  if e.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  if e.status<>'DRAFT' or e.archived_at is not null or s.status not in ('SCHEDULED','ACTIVE') or s.archived_at is not null then raise exception 'Evento no editable.' using errcode='23514'; end if;
  v_type:=upper(coalesce(p_config->>'event_type',e.event_type));
  if v_type not in ('STANDARD','EXHIBITION','FRIENDLY') then raise exception 'Tipo inválido.' using errcode='22023'; end if;
  if p_config ? 'timezone' and (nullif(btrim(p_config->>'timezone'),'') is null or not exists(select 1 from pg_catalog.pg_timezone_names zone where zone.name=nullif(btrim(p_config->>'timezone'),''))) then raise exception 'Timezone inválida.' using errcode='22023'; end if;
  if v_type<>'STANDARD' and exists(select 1 from public.competition_series_event_divisions d where d.event_id=e.id and d.is_active and d.scoring_mode='POINTS') then raise exception 'Tipo incompatible con POINTS.' using errcode='23514'; end if;
  v_changed := row(e.name,e.event_type,e.event_number,e.planned_starts_at,e.planned_ends_at,e.timezone,e.venue_name,e.venue_address,e.is_public)
    is distinct from row(coalesce(nullif(btrim(p_config->>'name'),''),e.name),v_type,case when p_config ? 'event_number' then (p_config->>'event_number')::integer else e.event_number end,
    case when p_config ? 'planned_starts_at' then (p_config->>'planned_starts_at')::timestamptz else e.planned_starts_at end,
    case when p_config ? 'planned_ends_at' then (p_config->>'planned_ends_at')::timestamptz else e.planned_ends_at end,
    case when p_config ? 'timezone' then nullif(btrim(p_config->>'timezone'),'') else e.timezone end,
    case when p_config ? 'venue_name' then nullif(btrim(p_config->>'venue_name'),'') else e.venue_name end,
    case when p_config ? 'venue_address' then nullif(btrim(p_config->>'venue_address'),'') else e.venue_address end,
    case when p_config ? 'is_public' then (p_config->>'is_public')::boolean else e.is_public end);
  if not v_changed then return e; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  update public.competition_series_events set name=coalesce(nullif(btrim(p_config->>'name'),''),name),event_type=v_type,
    event_number=case when p_config ? 'event_number' then (p_config->>'event_number')::integer else event_number end,
    planned_starts_at=case when p_config ? 'planned_starts_at' then (p_config->>'planned_starts_at')::timestamptz else planned_starts_at end,
    planned_ends_at=case when p_config ? 'planned_ends_at' then (p_config->>'planned_ends_at')::timestamptz else planned_ends_at end,
    timezone=case when p_config ? 'timezone' then nullif(btrim(p_config->>'timezone'),'') else timezone end,
    venue_name=case when p_config ? 'venue_name' then nullif(btrim(p_config->>'venue_name'),'') else venue_name end,
    venue_address=case when p_config ? 'venue_address' then nullif(btrim(p_config->>'venue_address'),'') else venue_address end,
    is_public=case when p_config ? 'is_public' then (p_config->>'is_public')::boolean else is_public end,
    revision=revision+1,updated_at=now() where id=e.id returning * into r;
  return r;
end $$;

create or replace function public.add_competition_series_event_division(p_club_id uuid,p_event_id uuid,p_series_division_id uuid,p_sort_order integer,p_event_revision integer)
returns public.competition_series_event_divisions language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; sd public.competition_series_divisions%rowtype; rid uuid; n integer; a uuid; r public.competition_series_event_divisions%rowtype;
begin
  a:=public.require_competition_event_access(p_club_id,false); select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if;
  if e.revision<>p_event_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  if e.status<>'DRAFT' or e.archived_at is not null then raise exception 'Evento no editable.' using errcode='23514'; end if;
  select * into sd from public.competition_series_divisions where id=p_series_division_id and club_id=p_club_id and series_id=e.series_id and is_active;
  if not found then raise exception 'División inválida.' using errcode='P0002'; end if;
  select count(*) into n from public.competition_series_rules where series_division_id=sd.id and status='ACTIVE';
  select rule.id into rid from public.competition_series_rules rule where rule.series_division_id=sd.id and rule.status='ACTIVE' order by rule.id limit 1;
  if n<>1 then raise exception 'La división requiere exactamente una regla ACTIVE.' using errcode='23514'; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  insert into public.competition_series_event_divisions(club_id,event_id,series_division_id,series_rule_id,scoring_mode,sort_order,created_by)
  values(p_club_id,e.id,sd.id,rid,case when e.event_type in ('EXHIBITION','FRIENDLY') then 'NON_SCORING' end,coalesce(p_sort_order,0),a) returning * into r;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id;
  return r;
end $$;

create or replace function public.configure_competition_series_event_division(p_club_id uuid,p_event_id uuid,p_division_id uuid,p_event_revision integer,p_scoring_mode text,p_event_tier_id uuid default null,p_scheme_override_id uuid default null,p_multiplier_override numeric default null)
returns public.competition_series_event_divisions language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; d public.competition_series_event_divisions%rowtype; s public.competition_series%rowtype; r public.competition_series_event_divisions%rowtype; mode text:=upper(p_scoring_mode);
begin
  perform public.require_competition_event_access(p_club_id,false); select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if; s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  if e.revision<>p_event_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into d from public.competition_series_event_divisions where id=p_division_id and event_id=e.id and is_active for update;
  if not found then raise exception 'División inexistente.' using errcode='P0002'; end if;
  if e.status<>'DRAFT' or e.archived_at is not null or d.status<>'DRAFT' then raise exception 'Configuración bloqueada.' using errcode='23514'; end if;
  if mode not in ('POINTS','NON_SCORING') then raise exception 'Scoring inválido.' using errcode='22023'; end if;
  if mode='NON_SCORING' and (p_event_tier_id is not null or p_scheme_override_id is not null or p_multiplier_override is not null) then raise exception 'NON_SCORING no admite tier ni overrides.' using errcode='23514'; end if;
  if mode='POINTS' and (e.event_type<>'STANDARD' or p_event_tier_id is null or p_scheme_override_id is null) then raise exception 'POINTS requiere STANDARD, tier y esquema explícito.' using errcode='23514'; end if;
  if p_event_tier_id is not null and not exists(select 1 from public.competition_event_tiers t where t.id=p_event_tier_id and t.club_id=p_club_id and t.is_active) then raise exception 'Tier inválido.' using errcode='23514'; end if;
  if p_scheme_override_id is not null and not exists(select 1 from public.points_schemes p where p.id=p_scheme_override_id and p.is_active and (p.is_global or p.club_id=p_club_id)) then raise exception 'Esquema inválido.' using errcode='23514'; end if;
  if p_multiplier_override is not null and p_multiplier_override<=0 then raise exception 'Multiplicador inválido.' using errcode='23514'; end if;
  if row(d.scoring_mode,d.event_tier_id,d.points_scheme_override_id,d.points_multiplier_override) is not distinct from row(mode,p_event_tier_id,p_scheme_override_id,p_multiplier_override) then return d; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  update public.competition_series_event_divisions set scoring_mode=mode,event_tier_id=p_event_tier_id,points_scheme_override_id=p_scheme_override_id,points_multiplier_override=p_multiplier_override,revision=revision+1,updated_at=now() where id=d.id returning * into r;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id; return r;
end $$;

create or replace function public.refresh_competition_series_event_division_rule(p_club_id uuid,p_event_id uuid,p_division_id uuid,p_event_revision integer)
returns public.competition_series_event_divisions language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; d public.competition_series_event_divisions%rowtype; s public.competition_series%rowtype; rid uuid; n integer; r public.competition_series_event_divisions%rowtype;
begin
  perform public.require_competition_event_access(p_club_id,false); select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  if e.revision<>p_event_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into d from public.competition_series_event_divisions where id=p_division_id and event_id=e.id and is_active for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if e.status<>'DRAFT' or e.archived_at is not null or d.status<>'DRAFT' then raise exception 'Refresh no permitido.' using errcode='23514'; end if;
  select count(*) into n from public.competition_series_rules where series_division_id=d.series_division_id and status='ACTIVE';
  select rule.id into rid from public.competition_series_rules rule where rule.series_division_id=d.series_division_id and rule.status='ACTIVE' order by rule.id limit 1;
  if n<>1 then raise exception 'Se requiere una regla ACTIVE.' using errcode='23514'; end if;
  if rid=d.series_rule_id then return d; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  update public.competition_series_event_divisions set series_rule_id=rid,configuration_snapshot=null,frozen_at=null,revision=revision+1,updated_at=now() where id=d.id returning * into r;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id; return r;
end $$;

create or replace function public.set_competition_series_event_division_active(p_club_id uuid,p_event_id uuid,p_division_id uuid,p_event_revision integer,p_active boolean,p_reason text default null)
returns public.competition_series_event_divisions language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; d public.competition_series_event_divisions%rowtype; s public.competition_series%rowtype; a uuid; rid uuid; n integer; r public.competition_series_event_divisions%rowtype;
begin
  a:=public.require_competition_event_access(p_club_id,false); select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  if e.revision<>p_event_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into d from public.competition_series_event_divisions where id=p_division_id and event_id=e.id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if e.status<>'DRAFT' or e.archived_at is not null or d.status<>'DRAFT' then raise exception 'Retiro no permitido.' using errcode='23514'; end if;
  if d.is_active=p_active then return d; end if;
  if p_active then
    select count(*) into n from public.competition_series_rules where series_division_id=d.series_division_id and status='ACTIVE';
    select rule.id into rid from public.competition_series_rules rule where rule.series_division_id=d.series_division_id and rule.status='ACTIVE' order by rule.id limit 1;
    if n<>1 then raise exception 'Se requiere una regla ACTIVE.' using errcode='23514'; end if;
  end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  if not p_active then
    if nullif(btrim(p_reason),'') is null then raise exception 'Motivo obligatorio.' using errcode='22023'; end if;
    update public.competition_series_event_tournament_links set status='REMOVED',ended_at=now(),ended_by=a,reason=coalesce(nullif(btrim(p_reason),''),'División retirada'),revision=revision+1,updated_at=now() where event_division_id=d.id and status='ACTIVE';
    update public.competition_series_event_divisions set is_active=false,removed_at=now(),removed_by=a,removal_reason=nullif(btrim(p_reason),''),revision=revision+1,updated_at=now() where id=d.id returning * into r;
  else
    update public.competition_series_event_divisions set is_active=true,removed_at=null,removed_by=null,removal_reason=null,series_rule_id=rid,revision=revision+1,updated_at=now() where id=d.id returning * into r;
  end if;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id; return r;
end $$;

create or replace function public.link_competition_series_event_tournament(p_club_id uuid,p_event_id uuid,p_division_id uuid,p_tournament_id uuid,p_event_revision integer,p_key text,p_replace boolean default false,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; d public.competition_series_event_divisions%rowtype; a uuid; old public.competition_series_event_tournament_links%rowtype; result jsonb; prior jsonb; req jsonb;
begin
  req:=jsonb_build_object('division_id',p_division_id,'tournament_id',p_tournament_id,'replace',p_replace,'reason',p_reason);
  prior:=public.competition_event_begin_command(p_club_id,p_event_id,p_event_revision,'TOURNAMENT_LINK',p_key,req); if prior is not null then return prior; end if;
  select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  a:=public.require_competition_event_access(p_club_id,e.status='SCHEDULED');
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  select * into d from public.competition_series_event_divisions where id=p_division_id and event_id=e.id and is_active for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if e.status not in ('DRAFT','SCHEDULED') then raise exception 'Vínculo no permitido.' using errcode='23514'; end if;
  if not exists(select 1 from public.tournaments t where t.id=p_tournament_id and t.club_id=p_club_id) then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  select * into old from public.competition_series_event_tournament_links l where l.event_division_id=d.id and l.status='ACTIVE' for update;
  if found and old.tournament_id=p_tournament_id then result:=jsonb_build_object('event_id',e.id,'link_id',old.id,'revision',e.revision); perform public.competition_event_finish_command(p_club_id,e.id,'TOURNAMENT_LINK',p_key,req,result); return result; end if;
  if found and not p_replace then raise exception 'Ya existe un vínculo activo.' using errcode='23505'; end if;
  if found and (p_reason is null or length(btrim(p_reason))=0) then raise exception 'El reemplazo requiere motivo.' using errcode='22023'; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  if found then update public.competition_series_event_tournament_links set status='REPLACED',ended_at=now(),ended_by=a,reason=btrim(p_reason),revision=revision+1,updated_at=now() where id=old.id; end if;
  insert into public.competition_series_event_tournament_links(club_id,event_division_id,tournament_id,linked_by) values(p_club_id,d.id,p_tournament_id,a) returning id into old.id;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id returning revision into e.revision;
  result:=jsonb_build_object('event_id',e.id,'link_id',old.id,'revision',e.revision); perform public.competition_event_finish_command(p_club_id,e.id,'TOURNAMENT_LINK',p_key,req,result); return result;
end $$;

create or replace function public.unlink_competition_series_event_tournament(p_club_id uuid,p_event_id uuid,p_division_id uuid,p_event_revision integer,p_key text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; d public.competition_series_event_divisions%rowtype; l public.competition_series_event_tournament_links%rowtype; a uuid; req jsonb; result jsonb; prior jsonb;
begin
  req:=jsonb_build_object('division_id',p_division_id,'reason',p_reason); prior:=public.competition_event_begin_command(p_club_id,p_event_id,p_event_revision,'TOURNAMENT_UNLINK',p_key,req); if prior is not null then return prior; end if;
  select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  a:=public.require_competition_event_access(p_club_id,e.status='SCHEDULED');
  s:=public.require_competition_event_series_state(p_club_id,e.series_id,e.season_id,array['SCHEDULED','ACTIVE']);
  select * into d from public.competition_series_event_divisions where id=p_division_id and event_id=e.id and is_active;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if e.status not in ('DRAFT','SCHEDULED') then raise exception 'Desvinculación no permitida.' using errcode='23514'; end if;
  select * into l from public.competition_series_event_tournament_links where event_division_id=d.id and status='ACTIVE' for update;
  if not found then result:=jsonb_build_object('event_id',e.id,'revision',e.revision); perform public.competition_event_finish_command(p_club_id,e.id,'TOURNAMENT_UNLINK',p_key,req,result); return result; end if;
  if e.status='SCHEDULED' and (p_reason is null or length(btrim(p_reason))=0) then raise exception 'Motivo obligatorio.' using errcode='22023'; end if;
  perform set_config('selpa.competition_event_write','allowed',true); update public.competition_series_event_tournament_links set status='REMOVED',ended_at=now(),ended_by=a,reason=coalesce(nullif(btrim(p_reason),''),'Desvinculación en borrador'),revision=revision+1,updated_at=now() where id=l.id;
  update public.competition_series_events set revision=revision+1,updated_at=now() where id=e.id returning revision into e.revision;
  result:=jsonb_build_object('event_id',e.id,'revision',e.revision); perform public.competition_event_finish_command(p_club_id,e.id,'TOURNAMENT_UNLINK',p_key,req,result); return result;
end $$;

create or replace function public.get_competition_series_event_completeness(p_club_id uuid,p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; blockers jsonb:='[]'; warnings jsonb:='[]'; d record; scheme uuid; mult numeric; v_active_count integer; v_terminal integer; v_completed integer; v_manage boolean; v_lifecycle boolean; v_links integer;
begin
  perform public.require_competition_event_read_access(p_club_id); select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id; if not found then raise exception 'Evento inexistente.' using errcode='P0002'; end if;
  select * into s from public.competition_series where id=e.series_id and club_id=e.club_id and season_id=e.season_id;
  if not found then blockers:=blockers||'"EVENT_RELATION_INVALID"'::jsonb; end if;
  if e.archived_at is not null then blockers:=blockers||'"EVENT_ARCHIVED"'::jsonb; end if;
  if s.id is not null and s.archived_at is not null then blockers:=blockers||'"SERIES_ARCHIVED"'::jsonb; end if;
  if s.id is null or s.status is distinct from 'ACTIVE' then blockers:=blockers||'"SERIES_NOT_ACTIVE"'::jsonb; end if;
  if e.status<>'DRAFT' then blockers:=blockers||'"EVENT_NOT_DRAFT"'::jsonb; end if;
  if e.planned_starts_at is null or e.planned_ends_at is null then blockers:=blockers||'"DATES_MISSING"'::jsonb; end if;
  if e.planned_starts_at is not null and e.planned_ends_at is not null and e.planned_ends_at<e.planned_starts_at then blockers:=blockers||'"DATES_INVALID"'::jsonb; end if;
  if e.timezone is null then blockers:=blockers||'"TIMEZONE_MISSING"'::jsonb;
  elsif not exists(select 1 from pg_catalog.pg_timezone_names zone where zone.name=e.timezone) then blockers:=blockers||'"TIMEZONE_INVALID"'::jsonb; end if;
  select count(*) into v_active_count from public.competition_series_event_divisions x where x.event_id=e.id and x.is_active and x.removed_at is null;
  if v_active_count=0 then blockers:=blockers||'"DIVISIONS_MISSING"'::jsonb; end if;
  for d in select x.*,sd.series_id division_series_id,sd.club_id division_club_id,cd.season_id competition_division_season_id,cd.club_id competition_division_club_id,r.status rule_status,r.frozen_at rule_frozen,r.points_scheme_id,r.series_division_id rule_division_id,r.club_id rule_club_id,t.is_active tier_active,t.points_multiplier,t.name tier_name,t.code tier_code,t.is_master_final,t.club_id tier_club_id
    from public.competition_series_event_divisions x
    left join public.competition_series_divisions sd on sd.id=x.series_division_id
    left join public.competition_divisions cd on cd.id=sd.division_id
    left join public.competition_series_rules r on r.id=x.series_rule_id
    left join public.competition_event_tiers t on t.id=x.event_tier_id
    where x.event_id=e.id and x.is_active loop
    if d.removed_at is not null or d.removed_by is not null then blockers:=blockers||jsonb_build_array('DIVISION_REMOVAL_INVALID:'||d.id); end if;
    if d.status<>'DRAFT' then blockers:=blockers||jsonb_build_array('DIVISION_NOT_DRAFT:'||d.id); end if;
    if d.configuration_snapshot is not null or d.frozen_at is not null then blockers:=blockers||jsonb_build_array('SNAPSHOT_UNEXPECTED:'||d.id); end if;
    if d.division_series_id is distinct from e.series_id or d.division_club_id is distinct from e.club_id or d.competition_division_club_id is distinct from e.club_id or d.competition_division_season_id is distinct from e.season_id or d.rule_division_id is distinct from d.series_division_id or d.rule_club_id is distinct from e.club_id then blockers:=blockers||jsonb_build_array('DIVISION_RELATION_INVALID:'||d.id); end if;
    if d.scoring_mode is null then blockers:=blockers||jsonb_build_array('SCORING_MISSING:'||d.id); end if;
    if d.rule_status is distinct from 'ACTIVE' or d.rule_frozen is null or d.rule_division_id is distinct from d.series_division_id or exists(select 1 from public.competition_series_rules ar where ar.series_division_id=d.series_division_id and ar.status='ACTIVE' and ar.id<>d.series_rule_id) then blockers:=blockers||jsonb_build_array('EVENT_RULE_CHANGED:'||d.id); end if;
    if d.scoring_mode='POINTS' then
      scheme:=d.points_scheme_override_id; mult:=coalesce(d.points_multiplier_override,d.points_multiplier);
      if e.event_type<>'STANDARD' then blockers:=blockers||jsonb_build_array('EVENT_TYPE_SCORING:'||d.id); end if;
      if d.event_tier_id is null or not coalesce(d.tier_active,false) or d.tier_club_id is distinct from e.club_id then blockers:=blockers||jsonb_build_array('TIER_INVALID:'||d.id); end if;
      if scheme is null or not exists(select 1 from public.points_schemes p where p.id=scheme and p.is_active and (p.is_global or p.club_id=e.club_id)) then blockers:=blockers||jsonb_build_array('SCHEME_INVALID:'||d.id); end if;
      if mult is null or mult<=0 then blockers:=blockers||jsonb_build_array('MULTIPLIER_INVALID:'||d.id); end if;
    elsif d.event_tier_id is not null or d.points_scheme_override_id is not null or d.points_multiplier_override is not null then blockers:=blockers||jsonb_build_array('NON_SCORING_INVALID:'||d.id); end if;
    if not exists(select 1 from public.competition_series_event_tournament_links l where l.event_division_id=d.id and l.status='ACTIVE') then warnings:=warnings||jsonb_build_array('TOURNAMENT_MISSING:'||d.id); end if;
  end loop;
  if s.id is not null and s.planned_events_count is not null and s.planned_events_count<>(select count(*) from public.competition_series_events se where se.series_id=s.id and se.archived_at is null) then warnings:=warnings||'"PLANNED_EVENTS_COUNT_DIFFERS"'::jsonb; end if;
  if e.venue_name is null then warnings:=warnings||'"VENUE_MISSING"'::jsonb; end if; if not e.is_public then warnings:=warnings||'"NOT_PUBLIC"'::jsonb; end if;
  select count(*) filter(where x.status in ('COMPLETED','CANCELLED')),count(*) filter(where x.status='COMPLETED') into v_terminal,v_completed from public.competition_series_event_divisions x where x.event_id=e.id and x.is_active and x.removed_at is null;
  select count(*) into v_links from public.competition_series_event_tournament_links l join public.competition_series_event_divisions x on x.id=l.event_division_id where x.event_id=e.id and l.status='ACTIVE';
  v_manage:=public.is_platform_admin() or public.has_club_capability(p_club_id,'competition:manage');
  v_lifecycle:=public.is_platform_admin() or exists(select 1 from public.club_memberships m where m.club_id=p_club_id and m.user_id=auth.uid() and m.status='APPROVED' and m.approved_at is not null and m.role::text in ('OWNER','ADMIN'));
  return jsonb_build_object('event_id',e.id,'revision',e.revision,'complete',jsonb_array_length(blockers)=0,'blockers',blockers,'warnings',warnings,
    'allowed_actions',jsonb_build_object(
      'edit',v_manage and e.archived_at is null and s.archived_at is null and s.status in ('SCHEDULED','ACTIVE') and e.status='DRAFT',
      'schedule',v_lifecycle and e.archived_at is null and s.archived_at is null and s.status='ACTIVE' and e.status='DRAFT' and jsonb_array_length(blockers)=0 and v_active_count>0,
      'reschedule',v_lifecycle and e.archived_at is null and s.archived_at is null and s.status='ACTIVE' and e.status='SCHEDULED',
      'complete',v_lifecycle and e.archived_at is null and s.archived_at is null and s.status='ACTIVE' and e.status='SCHEDULED' and v_active_count>0 and v_terminal=v_active_count and v_completed>0,
      'cancel',v_lifecycle and e.archived_at is null and s.archived_at is null and s.status='ACTIVE' and e.status in ('DRAFT','SCHEDULED') and v_completed=0,
      'archive',v_lifecycle and e.archived_at is null and s.archived_at is null and s.status in ('SCHEDULED','ACTIVE') and e.status in ('COMPLETED','CANCELLED'),
      'link_tournament',v_manage and e.archived_at is null and s.archived_at is null and s.status in ('SCHEDULED','ACTIVE') and e.status in ('DRAFT','SCHEDULED') and v_active_count>0,
      'unlink_tournament',v_manage and e.archived_at is null and s.archived_at is null and s.status in ('SCHEDULED','ACTIVE') and e.status in ('DRAFT','SCHEDULED') and v_links>0
    ));
end $$;

-- Generic lifecycle RPC implements the atomic aggregate transitions and durable idempotency contract.
create or replace function public.transition_competition_series_event(p_club_id uuid,p_event_id uuid,p_revision integer,p_operation text,p_key text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.competition_series_events%rowtype; s public.competition_series%rowtype; d record; a uuid; op text:=upper(p_operation); prior jsonb; result jsonb; comp jsonb; terminal integer; completed integer; active_count integer; reason text:=nullif(btrim(p_payload->>'reason'),''); ns timestamptz; ne timestamptz; ntz text; nvenue text; naddress text;
begin
  prior:=public.competition_event_begin_command(p_club_id,p_event_id,p_revision,op,p_key,p_payload); if prior is not null then return prior; end if;
  select * into e from public.competition_series_events where id=p_event_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  a:=public.require_competition_event_access(p_club_id,true);
  select * into s from public.competition_series where id=e.series_id and club_id=e.club_id and season_id=e.season_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if (e.archived_at is not null and op<>'ARCHIVE') or s.archived_at is not null or s.status in ('CLOSED','CANCELLED') then raise exception 'Agregado inmutable.' using errcode='23514'; end if;
  perform set_config('selpa.competition_event_write','allowed',true);
  if op='SCHEDULE' then
    if s.status<>'ACTIVE' or e.status<>'DRAFT' then raise exception 'Scheduling no permitido.' using errcode='23514'; end if;
    comp:=public.get_competition_series_event_completeness(p_club_id,e.id);
    if (comp->'blockers')::text like '%EVENT_RULE_CHANGED:%' then raise exception 'EVENT_RULE_CHANGED' using errcode='23505'; end if;
    if not (comp->>'complete')::boolean then raise exception 'Evento incompleto: %',comp->'blockers' using errcode='23514'; end if;
    if exists(select 1 from public.competition_series_event_divisions x where x.event_id=e.id and (not x.is_active or x.removed_at is not null) and x.status<>'DRAFT')
       or exists(select 1 from public.competition_series_event_divisions x where x.event_id=e.id and x.is_active and (x.status<>'DRAFT' or x.removed_at is not null or x.configuration_snapshot is not null or x.frozen_at is not null)) then
      raise exception 'EVENT_DIVISIONS_NOT_DRAFT' using errcode='23514';
    end if;
    perform set_config('selpa.competition_event_schedule','allowed',true);
    for d in select x.*,r.version,t.code tier_code,t.name tier_name,t.is_master_final,t.points_multiplier,t.is_active tier_active,el.id eligibility_id,el.revision eligibility_revision,to_jsonb(el) eligibility_snapshot,sd.division_snapshot
      from public.competition_series_event_divisions x join public.competition_series_rules r on r.id=x.series_rule_id join public.competition_series_divisions sd on sd.id=x.series_division_id
      left join public.competition_event_tiers t on t.id=x.event_tier_id left join public.competition_series_eligibility el on el.series_rule_id=r.id where x.event_id=e.id and x.is_active and x.status='DRAFT' and x.removed_at is null and x.configuration_snapshot is null and x.frozen_at is null for update of x loop
      update public.competition_series_event_divisions set status='SCHEDULED',frozen_at=now(),configuration_snapshot=jsonb_strip_nulls(jsonb_build_object('rule_id',d.series_rule_id,'rule_version',d.version,'eligibility_id',d.eligibility_id,'eligibility_revision',d.eligibility_revision,'eligibility',d.eligibility_snapshot,'tier_id',d.event_tier_id,'tier_code',d.tier_code,'tier_name',d.tier_name,'tier_is_master_final',d.is_master_final,'effective_points_scheme_id',d.points_scheme_override_id,'effective_multiplier',coalesce(d.points_multiplier_override,d.points_multiplier),'scoring_mode',d.scoring_mode,'division',d.division_snapshot,'frozen_at',now())),revision=revision+1,updated_at=now() where id=d.id;
    end loop;
    update public.competition_series_events set status='SCHEDULED',scheduled_by=a,scheduled_at=now(),revision=revision+1,updated_at=now() where id=e.id returning * into e;
    perform set_config('selpa.competition_event_schedule','',true);
  elsif op='RESCHEDULE' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' or reason is null then raise exception 'Reprogramación no permitida.' using errcode='23514'; end if;
    ns:=case when p_payload ? 'planned_starts_at' then (p_payload->>'planned_starts_at')::timestamptz else e.planned_starts_at end;
    ne:=case when p_payload ? 'planned_ends_at' then (p_payload->>'planned_ends_at')::timestamptz else e.planned_ends_at end;
    ntz:=case when p_payload ? 'timezone' then nullif(btrim(p_payload->>'timezone'),'') else e.timezone end;
    nvenue:=case when p_payload ? 'venue_name' then nullif(btrim(p_payload->>'venue_name'),'') else e.venue_name end;
    naddress:=case when p_payload ? 'venue_address' then nullif(btrim(p_payload->>'venue_address'),'') else e.venue_address end;
    if ns is null or ne is null or ne<ns or ntz is null or not exists(select 1 from pg_catalog.pg_timezone_names zone where zone.name=ntz) then raise exception 'Planificación inválida.' using errcode='22023'; end if;
    perform set_config('selpa.competition_event_history_insert','allowed',true);
    insert into public.competition_series_event_schedule_history(club_id,event_id,previous_planned_starts_at,previous_planned_ends_at,new_planned_starts_at,new_planned_ends_at,previous_timezone,new_timezone,previous_venue_name,new_venue_name,previous_venue_address,new_venue_address,reason,changed_by,resulting_event_revision)
    values(e.club_id,e.id,e.planned_starts_at,e.planned_ends_at,ns,ne,e.timezone,ntz,e.venue_name,nvenue,e.venue_address,naddress,reason,a,e.revision+1);
    perform set_config('selpa.competition_event_history_insert','',true);
    update public.competition_series_events set planned_starts_at=ns,planned_ends_at=ne,timezone=ntz,venue_name=nvenue,venue_address=naddress,revision=revision+1,updated_at=now() where id=e.id returning * into e;
  elsif op='COMPLETE_DIVISION' or op='CANCEL_DIVISION' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' then raise exception 'Lifecycle no permitido.' using errcode='23514'; end if;
    select * into d from public.competition_series_event_divisions where id=(p_payload->>'division_id')::uuid and event_id=e.id and is_active and status='SCHEDULED' for update;
    if not found then raise exception 'División no programada.' using errcode='P0002'; end if;
    if op='CANCEL_DIVISION' and reason is null then raise exception 'Motivo obligatorio.' using errcode='22023'; end if;
    update public.competition_series_event_divisions set status=case when op='COMPLETE_DIVISION' then 'COMPLETED' else 'CANCELLED' end,completed_by=case when op='COMPLETE_DIVISION' then a end,completed_at=case when op='COMPLETE_DIVISION' then now() end,cancelled_by=case when op='CANCEL_DIVISION' then a end,cancelled_at=case when op='CANCEL_DIVISION' then now() end,cancellation_reason=case when op='CANCEL_DIVISION' then reason end,revision=revision+1,updated_at=now() where id=d.id;
    select count(*) filter(where status in ('COMPLETED','CANCELLED')),count(*) filter(where status='COMPLETED'),count(*) into terminal,completed,active_count from public.competition_series_event_divisions where event_id=e.id and is_active;
    update public.competition_series_events set status=case when terminal=active_count and completed=0 then 'CANCELLED' else status end,cancelled_by=case when terminal=active_count and completed=0 then a else cancelled_by end,cancelled_at=case when terminal=active_count and completed=0 then now() else cancelled_at end,cancellation_reason=case when terminal=active_count and completed=0 then 'Todas las divisiones fueron canceladas.' else cancellation_reason end,revision=revision+1,updated_at=now() where id=e.id returning * into e;
  elsif op='COMPLETE' then
    if s.status<>'ACTIVE' or e.status<>'SCHEDULED' then raise exception 'Finalización no permitida.' using errcode='23514'; end if;
    select count(*) filter(where status in ('COMPLETED','CANCELLED')),count(*) filter(where status='COMPLETED'),count(*) into terminal,completed,active_count from public.competition_series_event_divisions where event_id=e.id and is_active;
    if active_count=0 or terminal<>active_count or completed=0 then raise exception 'Divisiones pendientes.' using errcode='23514'; end if;
    update public.competition_series_events set status='COMPLETED',completed_by=a,completed_at=now(),revision=revision+1,updated_at=now() where id=e.id returning * into e;
  elsif op='CANCEL' then
    if s.status<>'ACTIVE' or e.status not in ('DRAFT','SCHEDULED') or reason is null then raise exception 'Cancelación no permitida.' using errcode='23514'; end if;
    if exists(select 1 from public.competition_series_event_divisions x where x.event_id=e.id and x.is_active and x.status='COMPLETED') then raise exception 'Evento con divisiones completadas.' using errcode='23514'; end if;
    update public.competition_series_event_tournament_links l set status='REMOVED',ended_at=now(),ended_by=a,reason=reason,revision=l.revision+1,updated_at=now()
      where l.status='ACTIVE' and exists(select 1 from public.competition_series_event_divisions x where x.id=l.event_division_id and x.event_id=e.id and x.is_active);
    update public.competition_series_event_divisions set status='CANCELLED',cancelled_by=a,cancelled_at=now(),cancellation_reason=reason,revision=revision+1,updated_at=now() where event_id=e.id and is_active and status in ('DRAFT','SCHEDULED');
    update public.competition_series_events set status='CANCELLED',cancelled_by=a,cancelled_at=now(),cancellation_reason=reason,revision=revision+1,updated_at=now() where id=e.id returning * into e;
  elsif op='ARCHIVE' then
    if e.status not in ('COMPLETED','CANCELLED') then raise exception 'Solo eventos terminales.' using errcode='23514'; end if;
    if e.archived_at is not null then result:=jsonb_build_object('event_id',e.id,'status',e.status,'revision',e.revision,'archived_at',e.archived_at); perform public.competition_event_finish_command(p_club_id,e.id,op,p_key,p_payload,result); return result; end if;
    update public.competition_series_events set archived_by=a,archived_at=now(),revision=revision+1,updated_at=now() where id=e.id returning * into e;
  else raise exception 'Operación inválida.' using errcode='22023'; end if;
  result:=jsonb_build_object('event_id',e.id,'status',e.status,'revision',e.revision,'archived_at',e.archived_at); perform public.competition_event_finish_command(p_club_id,e.id,op,p_key,p_payload,result); return result;
end $$;

alter table public.competition_series_events enable row level security;
alter table public.competition_series_event_divisions enable row level security;
alter table public.competition_series_event_tournament_links enable row level security;
alter table public.competition_series_event_schedule_history enable row level security;
alter table public.competition_series_event_commands enable row level security;

do $$ declare t text; begin foreach t in array array['competition_series_events','competition_series_event_divisions','competition_series_event_tournament_links','competition_series_event_schedule_history','competition_series_event_commands'] loop execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant all on public.%I to service_role',t); end loop; end $$;
create policy competition_events_read on public.competition_series_events for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_event_divisions_read on public.competition_series_event_divisions for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_event_links_read on public.competition_series_event_tournament_links for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_event_history_read on public.competition_series_event_schedule_history for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_event_commands_owner_read on public.competition_series_event_commands for select to authenticated using(actor_id=auth.uid() and (public.is_platform_admin() or public.has_club_capability(club_id,'competition:manage')));

revoke all on function public.guard_competition_event_mutation() from public,anon,authenticated;
revoke all on function public.guard_competition_event_history_append_only() from public,anon,authenticated;
revoke all on function public.validate_competition_event_integrity() from public,anon,authenticated;
revoke all on function public.validate_competition_event_division_integrity() from public,anon,authenticated;
revoke all on function public.validate_competition_event_link_integrity() from public,anon,authenticated;
revoke all on function public.require_competition_event_access(uuid,boolean) from public,anon,authenticated;
revoke all on function public.require_competition_event_read_access(uuid) from public,anon,authenticated;
revoke all on function public.require_competition_event_series_state(uuid,uuid,uuid,text[]) from public,anon,authenticated;
revoke all on function public.competition_event_begin_command(uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.competition_event_finish_command(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.guard_competition_event_mutation() to service_role;
grant execute on function public.guard_competition_event_history_append_only() to service_role;
grant execute on function public.validate_competition_event_integrity() to service_role;
grant execute on function public.validate_competition_event_division_integrity() to service_role;
grant execute on function public.validate_competition_event_link_integrity() to service_role;
grant execute on function public.require_competition_event_access(uuid,boolean) to service_role;
grant execute on function public.require_competition_event_read_access(uuid) to service_role;
grant execute on function public.require_competition_event_series_state(uuid,uuid,uuid,text[]) to service_role;
grant execute on function public.competition_event_begin_command(uuid,uuid,integer,text,text,jsonb) to service_role;
grant execute on function public.competition_event_finish_command(uuid,uuid,text,text,jsonb,jsonb) to service_role;

do $$ declare sig text; begin foreach sig in array array[
  'create_competition_series_event(uuid,uuid,text)','update_competition_series_event_draft(uuid,uuid,integer,jsonb)',
  'add_competition_series_event_division(uuid,uuid,uuid,integer,integer)','configure_competition_series_event_division(uuid,uuid,uuid,integer,text,uuid,uuid,numeric)',
  'refresh_competition_series_event_division_rule(uuid,uuid,uuid,integer)','set_competition_series_event_division_active(uuid,uuid,uuid,integer,boolean,text)',
  'link_competition_series_event_tournament(uuid,uuid,uuid,uuid,integer,text,boolean,text)','unlink_competition_series_event_tournament(uuid,uuid,uuid,integer,text,text)',
  'get_competition_series_event_completeness(uuid,uuid)','transition_competition_series_event(uuid,uuid,integer,text,text,jsonb)'
] loop execute format('revoke all on function public.%s from public,anon',sig); execute format('grant execute on function public.%s to authenticated,service_role',sig); end loop; end $$;

comment on table public.competition_series_events is 'Stage 5A.3: fechas administrativas de circuitos; no reemplazan tournaments.';
comment on table public.competition_series_event_divisions is 'Unidad deportiva y futura unidad de homologación/settlement.';
comment on table public.competition_series_event_commands is 'Idempotencia durable aislada por evento. Política de retención pendiente: no existe purga automática en Stage 5A.3.';
comment on column public.competition_series_events.actual_starts_at is 'Stage 5A.3 no modela IN_PROGRESS: las fechas reales permanecen NULL salvo una futura fuente de lifecycle autorizada; no se inventan al completar.';
comment on table public.competition_series_event_schedule_history is 'Historial append-only: únicamente reschedule puede insertar; UPDATE y DELETE están prohibidos.';

commit;
