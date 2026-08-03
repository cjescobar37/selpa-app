begin;

do $$ begin
  if to_regclass('public.competition_series_event_divisions') is null
     or to_regclass('public.competition_series_event_tournament_links') is null
     or to_regclass('public.tournament_matches') is null
     or to_regclass('public.competition_player_entries') is null then
    raise exception 'Stage 5A.4 requiere Competition Engine Stage 5A.3, tournaments y player entries.';
  end if;
end $$;

create table public.competition_event_homologations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  event_division_id uuid not null,
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  version integer not null,
  revision integer not null default 1,
  status text not null default 'DRAFT',
  source_results_revision text,
  corrected_from_id uuid references public.competition_event_homologations(id) on delete restrict,
  notes text,
  result_snapshot jsonb,
  eligibility_snapshot jsonb,
  tournament_snapshot jsonb,
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  superseded_by_id uuid references public.competition_event_homologations(id) on delete restrict,
  superseded_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_homologations_event_fkey foreign key(club_id,event_id)
    references public.competition_series_events(club_id,id) on delete restrict,
  constraint competition_homologations_division_fkey foreign key(club_id,event_division_id)
    references public.competition_series_event_divisions(club_id,id) on delete restrict,
  constraint competition_homologations_status_chk check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUPERSEDED')),
  constraint competition_homologations_version_chk check(version>0),
  constraint competition_homologations_revision_chk check(revision>0),
  constraint competition_homologations_snapshots_chk check(
    (result_snapshot is null or jsonb_typeof(result_snapshot)='object') and
    (eligibility_snapshot is null or jsonb_typeof(eligibility_snapshot)='object') and
    (tournament_snapshot is null or jsonb_typeof(tournament_snapshot)='object')),
  constraint competition_homologations_lifecycle_chk check(
    (status='DRAFT' and submitted_at is null and approved_at is null and rejected_at is null and superseded_at is null)
    or (status='SUBMITTED' and submitted_at is not null and approved_at is null and rejected_at is null and superseded_at is null)
    or (status='APPROVED' and submitted_at is not null and approved_at is not null and rejected_at is null and superseded_at is null)
    or (status='REJECTED' and submitted_at is not null and rejected_at is not null and length(btrim(coalesce(rejection_reason,'')))>0 and superseded_at is null)
    or (status='SUPERSEDED' and submitted_at is not null and approved_at is not null and superseded_at is not null)),
  constraint competition_homologations_version_key unique(event_division_id,version),
  constraint competition_homologations_club_id_id_key unique(club_id,id)
);
create unique index competition_homologations_open_uidx on public.competition_event_homologations(event_division_id) where status in ('DRAFT','SUBMITTED');
create unique index competition_homologations_approved_uidx on public.competition_event_homologations(event_division_id) where status='APPROVED';
create index competition_homologations_list_idx on public.competition_event_homologations(club_id,event_division_id,version desc);

create table public.competition_event_homologation_results (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  homologation_id uuid not null, tournament_team_id uuid not null references public.tournament_teams(id) on delete restrict,
  final_position integer, result_role text not null default 'PARTICIPANT', matches_played integer not null default 0,
  wins integer not null default 0, losses integer not null default 0, walkovers integer not null default 0,
  disqualified boolean not null default false, withdrawn boolean not null default false,
  result_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint competition_homologation_results_parent_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_homologation_results_role_chk check(result_role in ('CHAMPION','RUNNER_UP','SEMIFINALIST','QUARTERFINALIST','PARTICIPANT','ADMINISTRATIVE')),
  constraint competition_homologation_results_counts_chk check((final_position is null or final_position>0) and matches_played>=0 and wins>=0 and losses>=0 and walkovers>=0),
  constraint competition_homologation_results_snapshot_chk check(jsonb_typeof(result_snapshot)='object'),
  constraint competition_homologation_results_team_key unique(homologation_id,tournament_team_id)
);

create table public.competition_event_homologation_participants (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  homologation_id uuid not null, player_id uuid not null references auth.users(id) on delete restrict,
  club_player_id uuid references public.club_players(id) on delete restrict,
  competition_player_entry_id uuid references public.competition_player_entries(id) on delete restrict,
  tournament_team_id uuid not null references public.tournament_teams(id) on delete restrict,
  participation_status text not null default 'PARTICIPATED', scoring_eligibility_status text not null,
  exclusion_code text, exclusion_reason text, final_position integer, result_role text not null default 'PARTICIPANT',
  participant_snapshot jsonb not null, created_at timestamptz not null default now(),
  constraint competition_homologation_participants_parent_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_homologation_participants_status_chk check(participation_status in ('PARTICIPATED','FINISHED','DISQUALIFIED','WITHDRAWN','INVITED')),
  constraint competition_homologation_participants_scoring_chk check(scoring_eligibility_status in ('ELIGIBLE','NON_SCORING','ENTRY_MISSING','ENTRY_INACTIVE','PLAYER_INACTIVE','AGE_INELIGIBLE','DIVISION_MISMATCH')),
  constraint competition_homologation_participants_exclusion_chk check((scoring_eligibility_status='ELIGIBLE' and exclusion_code is null) or (scoring_eligibility_status<>'ELIGIBLE' and length(btrim(coalesce(exclusion_code,'')))>0)),
  constraint competition_homologation_participants_snapshot_chk check(jsonb_typeof(participant_snapshot)='object'),
  constraint competition_homologation_participants_player_key unique(homologation_id,player_id)
);

create table public.competition_event_homologation_issues (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  homologation_id uuid not null, code text not null, severity text not null, entity_type text, entity_id uuid,
  message text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint competition_homologation_issues_parent_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_homologation_issues_severity_chk check(severity in ('BLOCKER','WARNING')),
  constraint competition_homologation_issues_text_chk check(length(btrim(code))>0 and length(btrim(message))>0),
  constraint competition_homologation_issues_details_chk check(jsonb_typeof(details)='object'),
  constraint competition_homologation_issues_key unique(homologation_id,code,entity_type,entity_id)
);

create table public.competition_event_homologation_evidence (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  homologation_id uuid not null, evidence_type text not null, storage_path text, external_url text,
  description text, checksum text, metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null references auth.users(id) on delete restrict, uploaded_at timestamptz not null default now(),
  constraint competition_homologation_evidence_parent_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_homologation_evidence_type_chk check(evidence_type in ('FILE','IMAGE','PDF','LINK','ACT','NOTE')),
  constraint competition_homologation_evidence_source_chk check(
    evidence_type='NOTE' or
    (storage_path is not null and storage_path ~ ('^homologations/'||club_id::text||'/[0-9a-f-]+/[^/]+$')) or
    (external_url is not null and external_url ~ '^https://')),
  constraint competition_homologation_evidence_metadata_chk check(jsonb_typeof(metadata)='object')
);

create table public.competition_event_homologation_commands (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  event_division_id uuid not null, homologation_id uuid, actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null, idempotency_key text not null, request_hash text not null, response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint competition_homologation_commands_division_fkey foreign key(club_id,event_division_id) references public.competition_series_event_divisions(club_id,id) on delete restrict,
  constraint competition_homologation_commands_parent_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_homologation_commands_key_chk check(length(btrim(idempotency_key)) between 8 and 200),
  constraint competition_homologation_commands_hash_chk check(request_hash ~ '^[0-9a-f]{64}$'),
  constraint competition_homologation_commands_response_chk check(response_payload is null or jsonb_typeof(response_payload)='object'),
  constraint competition_homologation_commands_scope_key unique(club_id,event_division_id,actor_id,operation,idempotency_key)
);

create index competition_homologation_participants_idx on public.competition_event_homologation_participants(homologation_id,final_position,player_id);
create index competition_homologation_results_idx on public.competition_event_homologation_results(homologation_id,final_position,tournament_team_id);
create index competition_homologation_issues_idx on public.competition_event_homologation_issues(homologation_id,severity,code);
create index competition_homologation_evidence_idx on public.competition_event_homologation_evidence(homologation_id,uploaded_at);

create or replace function public.require_competition_homologation_access(p_club_id uuid,p_decision boolean default false)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare a uuid:=auth.uid(); r text;
begin
  if a is null then raise exception 'Sesión requerida.' using errcode='28000'; end if;
  if public.is_platform_admin() then return a; end if;
  if not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'Sin permisos.' using errcode='42501'; end if;
  if p_decision then
    select m.role::text into r from public.club_memberships m where m.club_id=p_club_id and m.user_id=a and m.status='APPROVED' and m.approved_at is not null;
    if r is distinct from 'OWNER' and r is distinct from 'ADMIN' then raise exception 'Solo OWNER o ADMIN.' using errcode='42501'; end if;
  end if;
  return a;
end $$;

create or replace function public.guard_competition_homologation_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin
  if current_setting('selpa.competition_homologation_write',true) is distinct from 'allowed' then raise exception 'Use las RPC de homologación.' using errcode='42501'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create trigger trg_competition_homologations_guard before insert or update or delete on public.competition_event_homologations for each row execute function public.guard_competition_homologation_mutation();
create trigger trg_competition_homologation_results_guard before insert or update or delete on public.competition_event_homologation_results for each row execute function public.guard_competition_homologation_mutation();
create trigger trg_competition_homologation_participants_guard before insert or update or delete on public.competition_event_homologation_participants for each row execute function public.guard_competition_homologation_mutation();
create trigger trg_competition_homologation_issues_guard before insert or update or delete on public.competition_event_homologation_issues for each row execute function public.guard_competition_homologation_mutation();
create trigger trg_competition_homologation_evidence_guard before insert or update or delete on public.competition_event_homologation_evidence for each row execute function public.guard_competition_homologation_mutation();

create or replace function public.begin_competition_homologation_command(p_club_id uuid,p_division_id uuid,p_homologation_id uuid,p_operation text,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid:=auth.uid(); h text:=encode(extensions.digest(coalesce(p_payload,'{}'::jsonb)::text,'sha256'),'hex'); c public.competition_event_homologation_commands%rowtype;
begin
  if length(btrim(coalesce(p_key,''))) not between 8 and 200 then raise exception 'Idempotency-Key inválida.' using errcode='22023'; end if;
  select * into c from public.competition_event_homologation_commands where club_id=p_club_id and event_division_id=p_division_id and actor_id=a and operation=p_operation and idempotency_key=p_key;
  if found then
    if c.request_hash<>h then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return c.response_payload;
  end if;
  insert into public.competition_event_homologation_commands(club_id,event_division_id,homologation_id,actor_id,operation,idempotency_key,request_hash)
  values(p_club_id,p_division_id,p_homologation_id,a,p_operation,p_key,h);
  return null;
end $$;

create or replace function public.finish_competition_homologation_command(p_club_id uuid,p_division_id uuid,p_operation text,p_key text,p_response jsonb)
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.competition_event_homologation_commands set response_payload=p_response
  where club_id=p_club_id and event_division_id=p_division_id and actor_id=auth.uid() and operation=p_operation and idempotency_key=p_key and response_payload is null
$$;

create or replace function public.create_competition_event_homologation_draft(p_club_id uuid,p_event_division_id uuid,p_notes text default null)
returns public.competition_event_homologations language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; d public.competition_series_event_divisions%rowtype; e public.competition_series_events%rowtype; l public.competition_series_event_tournament_links%rowtype; h public.competition_event_homologations%rowtype; v integer;
begin
  a:=public.require_competition_homologation_access(p_club_id,false);
  select * into d from public.competition_series_event_divisions where id=p_event_division_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  select * into e from public.competition_series_events where id=d.event_id and club_id=p_club_id;
  if e.status<>'COMPLETED' or d.status<>'COMPLETED' or not d.is_active then raise exception 'EVENT_DIVISION_NOT_COMPLETED' using errcode='23514'; end if;
  select * into l from public.competition_series_event_tournament_links where event_division_id=d.id and club_id=p_club_id and status='ACTIVE';
  if not found then raise exception 'ACTIVE_TOURNAMENT_LINK_REQUIRED' using errcode='23514'; end if;
  select * into h from public.competition_event_homologations where event_division_id=d.id and status in ('DRAFT','SUBMITTED');
  if found then return h; end if;
  select coalesce(max(x.version),0)+1 into v from public.competition_event_homologations x where x.event_division_id=d.id;
  perform set_config('selpa.competition_homologation_write','allowed',true);
  insert into public.competition_event_homologations(club_id,event_id,event_division_id,tournament_id,version,notes,created_by)
  values(p_club_id,e.id,d.id,l.tournament_id,v,nullif(btrim(p_notes),''),a) returning * into h;
  return h;
end $$;

create or replace function public.extract_competition_event_homologation_results(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a uuid; h public.competition_event_homologations%rowtype; d public.competition_series_event_divisions%rowtype; replay jsonb; response jsonb; incomplete integer; duplicate_players integer; final_match_id uuid; final_team1 uuid; final_team2 uuid; final_winner uuid; requires_entry boolean:=true; allow_invited boolean:=false; invited_policy text:='REQUIRE_ENTRY'; tournament_status text; age_id uuid; age_min integer; age_max integer; age_reference date;
begin
  a:=public.require_competition_homologation_access(p_club_id,false);
  select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  if h.status<>'DRAFT' then raise exception 'HOMOLOGATION_IMMUTABLE' using errcode='23514'; end if;
  replay:=public.begin_competition_homologation_command(p_club_id,h.event_division_id,h.id,'EXTRACT',p_idempotency_key,jsonb_build_object('homologation_id',h.id,'revision',p_revision)); if replay is not null then return replay; end if;
  if h.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select * into d from public.competition_series_event_divisions where id=h.event_division_id;
  select t.status::text into tournament_status from public.tournaments t where t.id=h.tournament_id and t.club_id=p_club_id;
  select coalesce(x.requires_active_entry,true),coalesce(x.allow_invited_players,false),coalesce(x.invited_points_policy,'REQUIRE_ENTRY'),x.age_category_id
    into requires_entry,allow_invited,invited_policy,age_id from public.competition_series_eligibility x where x.series_rule_id=d.series_rule_id;
  if age_id is not null then
    select c.min_age,c.max_age,case c.age_reference_rule when 'EVENT_START_DATE' then coalesce(e.actual_starts_at,e.planned_starts_at)::date when 'SERIES_START_DATE' then s.starts_on when 'SEASON_START_DATE' then season.starts_on when 'SEASON_END_DATE' then season.ends_on when 'CALENDAR_YEAR_END' then make_date(extract(year from coalesce(e.actual_starts_at,e.planned_starts_at))::integer,12,31) else (c.age_reference_config->>'date')::date end
    into age_min,age_max,age_reference from public.competition_age_categories c join public.competition_series_events e on e.id=d.event_id join public.competition_series s on s.id=e.series_id join public.competition_seasons season on season.id=e.season_id where c.id=age_id and c.club_id=p_club_id;
  end if;
  perform set_config('selpa.competition_homologation_write','allowed',true);
  delete from public.competition_event_homologation_issues where homologation_id=h.id;
  delete from public.competition_event_homologation_participants where homologation_id=h.id;
  delete from public.competition_event_homologation_results where homologation_id=h.id;
  insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,matches_played,wins,losses,walkovers,result_snapshot)
  select p_club_id,h.id,t.id,count(m.id),count(m.id) filter(where m.winner_team_id=t.id),count(m.id) filter(where m.status='PLAYED' and m.winner_team_id is distinct from t.id),0,
    jsonb_build_object('team_id',t.id,'player1_user_id',t.player1_user_id,'player2_user_id',t.player2_user_id)
  from public.tournament_teams t left join public.tournament_matches m on m.tournament_id=t.tournament_id and t.id in(m.team1_id,m.team2_id)
  where t.tournament_id=h.tournament_id and t.club_id=p_club_id group by t.id;
  select m.id,m.team1_id,m.team2_id,m.winner_team_id into final_match_id,final_team1,final_team2,final_winner from public.tournament_matches m where m.tournament_id=h.tournament_id and m.phase='FINAL' and m.status='PLAYED' order by m.match_order desc,m.created_at desc limit 1;
  if final_match_id is not null and final_winner is not null then
    update public.competition_event_homologation_results set final_position=case when tournament_team_id=final_winner then 1 else 2 end,result_role=case when tournament_team_id=final_winner then 'CHAMPION' else 'RUNNER_UP' end where homologation_id=h.id and tournament_team_id in(final_team1,final_team2);
  end if;
  insert into public.competition_event_homologation_participants(club_id,homologation_id,player_id,club_player_id,competition_player_entry_id,tournament_team_id,participation_status,scoring_eligibility_status,exclusion_code,exclusion_reason,final_position,result_role,participant_snapshot)
  select p_club_id,h.id,u.user_id,cp.id,pe.id,u.team_id,'PARTICIPATED',
    case when d.scoring_mode='NON_SCORING' or (pe.id is null and allow_invited and invited_policy='NON_SCORING') then 'NON_SCORING' when cp.id is null then 'PLAYER_INACTIVE' when pe.id is null and requires_entry then 'ENTRY_MISSING' when pe.status is distinct from 'ACTIVE' then 'ENTRY_INACTIVE' else 'ELIGIBLE' end,
    case when d.scoring_mode='NON_SCORING' then 'NON_SCORING_EVENT' when pe.id is null and allow_invited and invited_policy='NON_SCORING' then 'INVITED_NON_SCORING' when cp.id is null then 'CLUB_PLAYER_MISSING' when pe.id is null and requires_entry then 'ACTIVE_ENTRY_REQUIRED' when pe.status is distinct from 'ACTIVE' then 'ENTRY_NOT_ACTIVE' end,
    case when d.scoring_mode='NON_SCORING' then 'El evento no adjudica puntos.' when pe.id is null and allow_invited and invited_policy='NON_SCORING' then 'Invitado habilitado para participar sin puntuar.' when cp.id is null then 'No existe jugador activo del club.' when pe.id is null and requires_entry then 'Falta entrada competitiva activa.' when pe.status is distinct from 'ACTIVE' then 'La entrada competitiva no está activa.' end,
    r.final_position,r.result_role,jsonb_build_object('player_id',u.user_id,'display_name',coalesce(pr.display_name,cp.display_name),'team_id',u.team_id,'club_player_id',cp.id,'entry_id',pe.id,'division_id',sd.division_id)
  from (select distinct on(raw.user_id) raw.team_id,raw.user_id from (select t.id team_id,t.player1_user_id user_id from public.tournament_teams t where t.tournament_id=h.tournament_id union all select t.id,t.player2_user_id from public.tournament_teams t where t.tournament_id=h.tournament_id and t.player2_user_id is not null) raw order by raw.user_id,raw.team_id) u
  join public.competition_event_homologation_results r on r.homologation_id=h.id and r.tournament_team_id=u.team_id
  left join public.club_players cp on cp.club_id=p_club_id and cp.user_id=u.user_id and cp.approved_at is not null
  left join public.profiles pr on pr.user_id=u.user_id
  left join public.competition_series_divisions sd on sd.id=d.series_division_id and sd.club_id=p_club_id
  left join public.competition_player_entries pe on pe.club_id=p_club_id and pe.club_player_id=cp.id and pe.division_id=sd.division_id and pe.status='ACTIVE';
  if age_id is not null then
    update public.competition_event_homologation_participants hp set scoring_eligibility_status='AGE_INELIGIBLE',exclusion_code='AGE_CATEGORY_INVALID',exclusion_reason='La edad no cumple la categoría etaria congelada.'
    from public.profiles profile where hp.homologation_id=h.id and hp.player_id=profile.user_id and (profile.birth_date is null or age_reference is null or (age_min is not null and extract(year from age(age_reference,profile.birth_date))<age_min) or (age_max is not null and extract(year from age(age_reference,profile.birth_date))>age_max));
  end if;
  select count(*) into incomplete from public.tournament_matches m where m.tournament_id=h.tournament_id and (m.status<>'PLAYED' or m.winner_team_id is null);
  select count(*) into duplicate_players from (select raw.user_id from (select t.player1_user_id user_id from public.tournament_teams t where t.tournament_id=h.tournament_id union all select t.player2_user_id from public.tournament_teams t where t.tournament_id=h.tournament_id) raw group by raw.user_id having count(*)>1) duplicated;
  if duplicate_players>0 then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'PARTICIPANT_DUPLICATED','BLOCKER','Un participante aparece en más de un equipo.',jsonb_build_object('count',duplicate_players)); end if;
  if tournament_status is distinct from 'FINISHED' then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'TOURNAMENT_NOT_FINISHED','BLOCKER','El torneo operativo no está finalizado.',jsonb_build_object('status',tournament_status)); end if;
  if incomplete>0 then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message,details) values(p_club_id,h.id,'MATCHES_INCOMPLETE','BLOCKER','Hay partidos incompletos.',jsonb_build_object('count',incomplete)); end if;
  if final_match_id is null then insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,message) values(p_club_id,h.id,'FINAL_RESULT_MISSING','BLOCKER','Falta un resultado final válido.'); end if;
  insert into public.competition_event_homologation_issues(club_id,homologation_id,code,severity,entity_type,entity_id,message)
  select p_club_id,h.id,'SCORING_INELIGIBLE',case when p.scoring_eligibility_status in('ENTRY_MISSING','ENTRY_INACTIVE','PLAYER_INACTIVE') and d.scoring_mode='POINTS' and invited_policy='REQUIRE_ENTRY' then 'BLOCKER' else 'WARNING' end,'PLAYER',p.player_id,coalesce(p.exclusion_reason,'Participante no elegible para puntuar.') from public.competition_event_homologation_participants p where p.homologation_id=h.id and p.scoring_eligibility_status<>'ELIGIBLE';
  update public.competition_event_homologations set revision=revision+1,source_results_revision=encode(extensions.digest((select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'winner',m.winner_team_id,'score',m.score) order by m.id),'[]'::jsonb)::text from public.tournament_matches m where m.tournament_id=h.tournament_id),'sha256'),'hex'),updated_at=now() where id=h.id returning revision into p_revision;
  response:=jsonb_build_object('id',h.id,'revision',p_revision,'status','DRAFT'); perform public.finish_competition_homologation_command(p_club_id,h.event_division_id,'EXTRACT',p_idempotency_key,response); return response;
end $$;

create or replace function public.get_competition_event_homologation_preflight(p_club_id uuid,p_homologation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h public.competition_event_homologations%rowtype; blockers jsonb; warnings jsonb; can_manage boolean; can_decide boolean; current_hash text; structural jsonb:='[]'::jsonb;
begin
  perform public.require_competition_event_read_access(p_club_id);
  select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id; if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('code',i.code,'message',i.message,'entity_type',i.entity_type,'entity_id',i.entity_id) order by i.code),'[]'::jsonb) into blockers from public.competition_event_homologation_issues i where i.homologation_id=h.id and i.severity='BLOCKER';
  select coalesce(jsonb_agg(jsonb_build_object('code',i.code,'message',i.message,'entity_type',i.entity_type,'entity_id',i.entity_id) order by i.code),'[]'::jsonb) into warnings from public.competition_event_homologation_issues i where i.homologation_id=h.id and i.severity='WARNING';
  select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'winner',m.winner_team_id,'score',m.score) order by m.id),'[]'::jsonb)::text,'sha256'),'hex') into current_hash from public.tournament_matches m where m.tournament_id=h.tournament_id;
  if h.source_results_revision is null then structural:=structural||jsonb_build_array(jsonb_build_object('code','RESULTS_NOT_EXTRACTED','message','Todavía no se extrajeron resultados.')); elsif current_hash is distinct from h.source_results_revision then structural:=structural||jsonb_build_array(jsonb_build_object('code','SOURCE_RESULTS_CHANGED','message','Los resultados operativos cambiaron después de la extracción.')); end if;
  if not exists(select 1 from public.competition_series_event_divisions d join public.competition_series_events e on e.id=d.event_id and e.club_id=d.club_id join public.competition_series_event_tournament_links l on l.event_division_id=d.id and l.club_id=d.club_id and l.status='ACTIVE' join public.tournaments t on t.id=l.tournament_id and t.club_id=l.club_id where d.id=h.event_division_id and d.club_id=p_club_id and d.status='COMPLETED' and e.status='COMPLETED' and t.id=h.tournament_id and t.status::text='FINISHED') then structural:=structural||jsonb_build_array(jsonb_build_object('code','SOURCE_SCOPE_NOT_READY','message','Evento, división, vínculo o torneo dejaron de cumplir las precondiciones.')); end if;
  blockers:=blockers||structural;
  can_manage:=public.is_platform_admin() or public.has_club_capability(p_club_id,'competition:manage');
  can_decide:=public.is_platform_admin() or exists(select 1 from public.club_memberships m where m.club_id=p_club_id and m.user_id=auth.uid() and m.status='APPROVED' and m.approved_at is not null and m.role::text in('OWNER','ADMIN'));
  return jsonb_build_object('homologation_id',h.id,'status',h.status,'revision',h.revision,'blockers',blockers,'warnings',warnings,'allowed_actions',jsonb_build_object('extract',can_manage and h.status='DRAFT','submit',can_manage and h.status='DRAFT' and jsonb_array_length(blockers)=0,'approve',can_decide and h.status='SUBMITTED' and jsonb_array_length(blockers)=0,'reject',can_decide and h.status='SUBMITTED','correct',can_manage and h.status in('REJECTED','APPROVED'),'supersede',can_decide and h.status='APPROVED'));
end $$;

create or replace function public.transition_competition_event_homologation(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_operation text,p_idempotency_key text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.competition_event_homologations%rowtype; a uuid; replay jsonb; response jsonb; blockers integer; reason text:=nullif(btrim(p_payload->>'reason'),''); decision boolean:=upper(p_operation) in('APPROVE','REJECT','SUPERSEDE'); current_hash text;
begin
  a:=public.require_competition_homologation_access(p_club_id,decision);
  select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id for update; if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if;
  replay:=public.begin_competition_homologation_command(p_club_id,h.event_division_id,h.id,upper(p_operation),p_idempotency_key,jsonb_build_object('revision',p_revision,'payload',coalesce(p_payload,'{}'::jsonb))); if replay is not null then return replay; end if;
  if h.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  select count(*) into blockers from public.competition_event_homologation_issues where homologation_id=h.id and severity='BLOCKER';
  if upper(p_operation) in('SUBMIT','APPROVE') then
    select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'winner',m.winner_team_id,'score',m.score) order by m.id),'[]'::jsonb)::text,'sha256'),'hex') into current_hash from public.tournament_matches m where m.tournament_id=h.tournament_id;
    if h.source_results_revision is null or current_hash is distinct from h.source_results_revision then raise exception 'SOURCE_RESULTS_CHANGED' using errcode='23514'; end if;
    if not exists(select 1 from public.competition_series_event_divisions d join public.competition_series_events e on e.id=d.event_id and e.club_id=d.club_id join public.competition_series_event_tournament_links l on l.event_division_id=d.id and l.club_id=d.club_id and l.status='ACTIVE' join public.tournaments t on t.id=l.tournament_id and t.club_id=l.club_id where d.id=h.event_division_id and d.club_id=p_club_id and d.status='COMPLETED' and e.status='COMPLETED' and t.id=h.tournament_id and t.status::text='FINISHED') then raise exception 'SOURCE_SCOPE_NOT_READY' using errcode='23514'; end if;
  end if;
  perform set_config('selpa.competition_homologation_write','allowed',true);
  case upper(p_operation)
    when 'SUBMIT' then
      if h.status<>'DRAFT' or blockers>0 or not exists(select 1 from public.competition_event_homologation_participants where homologation_id=h.id) then raise exception 'HOMOLOGATION_NOT_READY' using errcode='23514'; end if;
      update public.competition_event_homologations x set status='SUBMITTED',submitted_by=a,submitted_at=now(),result_snapshot=(select jsonb_build_object('results',coalesce(jsonb_agg(to_jsonb(r) order by r.final_position nulls last,r.tournament_team_id),'[]'::jsonb)) from public.competition_event_homologation_results r where r.homologation_id=h.id),eligibility_snapshot=(select jsonb_build_object('participants',coalesce(jsonb_agg(to_jsonb(p) order by p.player_id),'[]'::jsonb)) from public.competition_event_homologation_participants p where p.homologation_id=h.id),tournament_snapshot=(select jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'start_date',t.start_date,'end_date',t.end_date) from public.tournaments t where t.id=h.tournament_id),revision=x.revision+1,updated_at=now() where x.id=h.id returning * into h;
    when 'APPROVE' then
      if h.status<>'SUBMITTED' or blockers>0 then raise exception 'HOMOLOGATION_NOT_APPROVABLE' using errcode='23514'; end if;
      if h.corrected_from_id is not null then update public.competition_event_homologations x set status='SUPERSEDED',superseded_by_id=h.id,superseded_at=now(),revision=x.revision+1,updated_at=now() where x.id=h.corrected_from_id and x.status='APPROVED'; end if;
      update public.competition_event_homologations x set status='APPROVED',reviewed_by=a,reviewed_at=now(),approved_by=a,approved_at=now(),revision=x.revision+1,updated_at=now() where x.id=h.id returning * into h;
    when 'REJECT' then
      if h.status<>'SUBMITTED' or reason is null then raise exception 'REJECTION_REASON_REQUIRED' using errcode='23514'; end if;
      update public.competition_event_homologations x set status='REJECTED',reviewed_by=a,reviewed_at=now(),rejected_by=a,rejected_at=now(),rejection_reason=reason,revision=x.revision+1,updated_at=now() where x.id=h.id returning * into h;
    when 'SUPERSEDE' then
      if h.status<>'APPROVED' or reason is null then raise exception 'SUPERSEDE_NOT_ALLOWED' using errcode='23514'; end if;
      update public.competition_event_homologations x set status='SUPERSEDED',superseded_at=now(),notes=concat_ws(E'\n',x.notes,'Supersede: '||reason),revision=x.revision+1,updated_at=now() where x.id=h.id returning * into h;
    else raise exception 'Operación inválida.' using errcode='22023';
  end case;
  response:=jsonb_build_object('id',h.id,'status',h.status,'revision',h.revision,'version',h.version); perform public.finish_competition_homologation_command(p_club_id,h.event_division_id,upper(p_operation),p_idempotency_key,response); return response;
end $$;

create or replace function public.submit_competition_event_homologation(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_homologation(p_club_id,p_homologation_id,p_revision,'SUBMIT',p_idempotency_key,'{}') $$;
create or replace function public.approve_competition_event_homologation(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_homologation(p_club_id,p_homologation_id,p_revision,'APPROVE',p_idempotency_key,'{}') $$;
create or replace function public.reject_competition_event_homologation(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text,p_reason text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_homologation(p_club_id,p_homologation_id,p_revision,'REJECT',p_idempotency_key,jsonb_build_object('reason',p_reason)) $$;
create or replace function public.supersede_competition_event_homologation(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text,p_reason text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_homologation(p_club_id,p_homologation_id,p_revision,'SUPERSEDE',p_idempotency_key,jsonb_build_object('reason',p_reason)) $$;

create or replace function public.create_competition_event_homologation_correction(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare source public.competition_event_homologations%rowtype; draft public.competition_event_homologations%rowtype; a uuid; replay jsonb; response jsonb; v integer;
begin
  a:=public.require_competition_homologation_access(p_club_id,false); select * into source from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if; if source.status not in('REJECTED','APPROVED') then raise exception 'CORRECTION_NOT_ALLOWED' using errcode='23514'; end if;
  replay:=public.begin_competition_homologation_command(p_club_id,source.event_division_id,source.id,'CORRECTION',p_idempotency_key,jsonb_build_object('source',source.id,'revision',p_revision,'notes',p_notes)); if replay is not null then return replay; end if;
  if source.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  if exists(select 1 from public.competition_event_homologations where event_division_id=source.event_division_id and status in('DRAFT','SUBMITTED')) then raise exception 'OPEN_HOMOLOGATION_EXISTS' using errcode='23505'; end if;
  select max(version)+1 into v from public.competition_event_homologations where event_division_id=source.event_division_id;
  perform set_config('selpa.competition_homologation_write','allowed',true); insert into public.competition_event_homologations(club_id,event_id,event_division_id,tournament_id,version,corrected_from_id,notes,created_by) values(p_club_id,source.event_id,source.event_division_id,source.tournament_id,v,source.id,nullif(btrim(p_notes),''),a) returning * into draft;
  response:=jsonb_build_object('id',draft.id,'status',draft.status,'revision',draft.revision,'version',draft.version); perform public.finish_competition_homologation_command(p_club_id,source.event_division_id,'CORRECTION',p_idempotency_key,response); return response;
end $$;

create or replace function public.add_competition_event_homologation_evidence(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_evidence_type text,p_storage_path text default null,p_external_url text default null,p_description text default null,p_checksum text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare h public.competition_event_homologations%rowtype; a uuid; e public.competition_event_homologation_evidence%rowtype;
begin
  a:=public.require_competition_homologation_access(p_club_id,false); select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id for update;
  if not found then raise exception 'Recurso inexistente.' using errcode='P0002'; end if; if h.status<>'DRAFT' then raise exception 'HOMOLOGATION_IMMUTABLE' using errcode='23514'; end if; if h.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  perform set_config('selpa.competition_homologation_write','allowed',true); insert into public.competition_event_homologation_evidence(club_id,homologation_id,evidence_type,storage_path,external_url,description,checksum,metadata,uploaded_by) values(p_club_id,h.id,upper(p_evidence_type),nullif(btrim(p_storage_path),''),nullif(btrim(p_external_url),''),nullif(btrim(p_description),''),nullif(btrim(p_checksum),''),coalesce(p_metadata,'{}'),a) returning * into e;
  update public.competition_event_homologations set revision=revision+1,updated_at=now() where id=h.id returning revision into p_revision; return jsonb_build_object('evidence_id',e.id,'revision',p_revision);
end $$;

do $$ declare t text; begin
  foreach t in array array['competition_event_homologations','competition_event_homologation_results','competition_event_homologation_participants','competition_event_homologation_issues','competition_event_homologation_evidence','competition_event_homologation_commands'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
create policy competition_homologations_read on public.competition_event_homologations for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_homologation_results_read on public.competition_event_homologation_results for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_homologation_participants_read on public.competition_event_homologation_participants for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_homologation_issues_read on public.competition_event_homologation_issues for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_homologation_evidence_read on public.competition_event_homologation_evidence for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_homologation_commands_owner_read on public.competition_event_homologation_commands for select to authenticated using(actor_id=auth.uid() and (public.is_platform_admin() or public.has_club_capability(club_id,'competition:manage')));

revoke all on function public.require_competition_homologation_access(uuid,boolean),public.guard_competition_homologation_mutation(),public.begin_competition_homologation_command(uuid,uuid,uuid,text,text,jsonb),public.finish_competition_homologation_command(uuid,uuid,text,text,jsonb),public.transition_competition_event_homologation(uuid,uuid,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_competition_event_homologation_draft(uuid,uuid,text),public.extract_competition_event_homologation_results(uuid,uuid,integer,text),public.get_competition_event_homologation_preflight(uuid,uuid),public.submit_competition_event_homologation(uuid,uuid,integer,text),public.approve_competition_event_homologation(uuid,uuid,integer,text),public.reject_competition_event_homologation(uuid,uuid,integer,text,text),public.create_competition_event_homologation_correction(uuid,uuid,integer,text,text),public.supersede_competition_event_homologation(uuid,uuid,integer,text,text),public.add_competition_event_homologation_evidence(uuid,uuid,integer,text,text,text,text,text,jsonb) to authenticated,service_role;

comment on table public.competition_event_homologations is 'Stage 5A.4: agregado versionado de homologación por división de evento. No adjudica puntos.';
commit;
