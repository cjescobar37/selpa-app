begin;

do $$ begin
  if to_regclass('public.competition_event_homologations') is null
     or to_regclass('public.competition_point_transactions') is null then
    raise exception 'Stage 5A.5 requiere Homologation Stage 5A.4 y Points Ledger Stage 4.';
  end if;
end $$;

create table public.competition_event_settlements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  event_id uuid not null,
  event_division_id uuid not null,
  homologation_id uuid not null,
  homologation_revision integer not null,
  version integer not null,
  revision integer not null default 1,
  status text not null default 'DRAFT',
  scoring_mode text not null,
  series_rule_id uuid not null,
  event_tier_id uuid,
  points_scheme_id uuid,
  effective_multiplier numeric(10,4) not null default 1,
  calculation_snapshot jsonb,
  calculated_by uuid references auth.users(id) on delete restrict,
  calculated_at timestamptz,
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  rejected_by uuid references auth.users(id) on delete restrict,
  rejected_at timestamptz,
  rejection_reason text,
  corrected_from_id uuid references public.competition_event_settlements(id) on delete restrict,
  superseded_by_id uuid references public.competition_event_settlements(id) on delete restrict,
  superseded_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint competition_settlements_event_fkey foreign key(club_id,event_id) references public.competition_series_events(club_id,id) on delete restrict,
  constraint competition_settlements_division_fkey foreign key(club_id,event_division_id) references public.competition_series_event_divisions(club_id,id) on delete restrict,
  constraint competition_settlements_homologation_fkey foreign key(club_id,homologation_id) references public.competition_event_homologations(club_id,id) on delete restrict,
  constraint competition_settlements_status_chk check(status in('DRAFT','CALCULATED','SUBMITTED','APPROVED','PUBLISHED','REJECTED','SUPERSEDED')),
  constraint competition_settlements_scoring_chk check(scoring_mode in('POINTS','NON_SCORING')),
  constraint competition_settlements_numbers_chk check(version>0 and revision>0 and homologation_revision>0 and effective_multiplier>0),
  constraint competition_settlements_snapshot_chk check(calculation_snapshot is null or jsonb_typeof(calculation_snapshot)='object'),
  constraint competition_settlements_lifecycle_chk check(
    (status='DRAFT' and calculated_at is null and submitted_at is null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='CALCULATED' and calculated_at is not null and submitted_at is null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='SUBMITTED' and calculated_at is not null and submitted_at is not null and approved_at is null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='APPROVED' and calculated_at is not null and submitted_at is not null and approved_at is not null and published_at is null and rejected_at is null and superseded_at is null) or
    (status='PUBLISHED' and calculated_at is not null and submitted_at is not null and approved_at is not null and published_at is not null and rejected_at is null and superseded_at is null) or
    (status='REJECTED' and submitted_at is not null and rejected_at is not null and length(btrim(coalesce(rejection_reason,'')))>0 and published_at is null and superseded_at is null) or
    (status='SUPERSEDED' and superseded_at is not null and published_at is null)),
  constraint competition_settlements_version_key unique(event_division_id,version),
  constraint competition_settlements_club_id_id_key unique(club_id,id)
);
create unique index competition_settlements_editable_uidx on public.competition_event_settlements(event_division_id) where status in('DRAFT','CALCULATED','SUBMITTED','APPROVED');
create unique index competition_settlements_published_homologation_uidx on public.competition_event_settlements(homologation_id) where status='PUBLISHED';
create index competition_settlements_list_idx on public.competition_event_settlements(club_id,event_division_id,version desc);

create table public.competition_event_settlement_awards (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  settlement_id uuid not null, player_id uuid not null references auth.users(id) on delete restrict,
  club_player_id uuid references public.club_players(id) on delete restrict,
  competition_player_entry_id uuid references public.competition_player_entries(id) on delete restrict,
  homologation_participant_id uuid not null references public.competition_event_homologation_participants(id) on delete restrict,
  final_position integer, result_code text not null, base_points integer not null default 0,
  multiplier numeric(10,4) not null, bonus_points integer not null default 0, penalty_points integer not null default 0,
  total_points integer not null, scoring_eligibility_status text not null, excluded_reason text,
  calculation_detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint competition_settlement_awards_parent_fkey foreign key(club_id,settlement_id) references public.competition_event_settlements(club_id,id) on delete restrict,
  constraint competition_settlement_awards_position_chk check(final_position is null or final_position>0),
  constraint competition_settlement_awards_multiplier_chk check(multiplier>0),
  constraint competition_settlement_awards_total_chk check(total_points=round((base_points+bonus_points+penalty_points)*multiplier)::integer),
  constraint competition_settlement_awards_eligibility_chk check(scoring_eligibility_status in('ELIGIBLE','NON_SCORING','ENTRY_MISSING','ENTRY_INACTIVE','PLAYER_INACTIVE','AGE_INELIGIBLE','DIVISION_MISMATCH')),
  constraint competition_settlement_awards_excluded_chk check((scoring_eligibility_status='ELIGIBLE' and excluded_reason is null) or scoring_eligibility_status<>'ELIGIBLE'),
  constraint competition_settlement_awards_detail_chk check(jsonb_typeof(calculation_detail)='object'),
  constraint competition_settlement_awards_player_key unique(settlement_id,player_id),
  constraint competition_settlement_awards_participant_key unique(settlement_id,homologation_participant_id),
  constraint competition_settlement_awards_club_id_id_key unique(club_id,id)
);
create index competition_settlement_awards_list_idx on public.competition_event_settlement_awards(settlement_id,final_position,player_id);

create table public.competition_event_settlement_issues (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  settlement_id uuid not null, code text not null, severity text not null, entity_type text, entity_id uuid,
  message text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint competition_settlement_issues_parent_fkey foreign key(club_id,settlement_id) references public.competition_event_settlements(club_id,id) on delete restrict,
  constraint competition_settlement_issues_severity_chk check(severity in('BLOCKER','WARNING')),
  constraint competition_settlement_issues_text_chk check(length(btrim(code))>0 and length(btrim(message))>0),
  constraint competition_settlement_issues_details_chk check(jsonb_typeof(details)='object'),
  constraint competition_settlement_issues_key unique(settlement_id,code,entity_type,entity_id)
);

create table public.competition_event_settlement_commands (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete restrict,
  event_division_id uuid not null, settlement_id uuid, actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null, idempotency_key text not null, request_hash text not null, response_payload jsonb,
  created_at timestamptz not null default now(),
  constraint competition_settlement_commands_division_fkey foreign key(club_id,event_division_id) references public.competition_series_event_divisions(club_id,id) on delete restrict,
  constraint competition_settlement_commands_parent_fkey foreign key(club_id,settlement_id) references public.competition_event_settlements(club_id,id) on delete restrict,
  constraint competition_settlement_commands_key_chk check(length(btrim(idempotency_key)) between 8 and 200),
  constraint competition_settlement_commands_hash_chk check(request_hash ~ '^[0-9a-f]{64}$'),
  constraint competition_settlement_commands_response_chk check(response_payload is null or jsonb_typeof(response_payload)='object'),
  constraint competition_settlement_commands_scope_key unique(club_id,event_division_id,actor_id,operation,idempotency_key)
);

create or replace function public.require_competition_settlement_access(p_club_id uuid,p_decision boolean default false)
returns uuid language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); role_name text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if public.is_platform_admin() then return actor; end if;
  if not public.has_club_capability(p_club_id,case when p_decision then 'competition:manage' else 'competition:view' end) then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if p_decision then select m.role::text into role_name from public.club_memberships m where m.club_id=p_club_id and m.user_id=actor and m.status='APPROVED' and m.approved_at is not null;
    if role_name is null or role_name not in('OWNER','ADMIN') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  end if;
  return actor;
end $$;

create or replace function public.begin_competition_settlement_command(p_club_id uuid,p_division_id uuid,p_settlement_id uuid,p_operation text,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); digest text:=encode(extensions.digest(coalesce(p_payload,'{}')::text,'sha256'),'hex'); old public.competition_event_settlement_commands%rowtype;
begin
  if actor is null or length(btrim(coalesce(p_key,'')))<8 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  select * into old from public.competition_event_settlement_commands c where c.club_id=p_club_id and c.event_division_id=p_division_id and c.actor_id=actor and c.operation=p_operation and c.idempotency_key=p_key for update;
  if found then if old.request_hash<>digest then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if; return old.response_payload; end if;
  insert into public.competition_event_settlement_commands(club_id,event_division_id,settlement_id,actor_id,operation,idempotency_key,request_hash) values(p_club_id,p_division_id,p_settlement_id,actor,p_operation,p_key,digest);
  return null;
end $$;
create or replace function public.finish_competition_settlement_command(p_club_id uuid,p_division_id uuid,p_operation text,p_key text,p_response jsonb)
returns void language sql security definer set search_path=pg_catalog,public as $$ update public.competition_event_settlement_commands set response_payload=p_response where club_id=p_club_id and event_division_id=p_division_id and actor_id=auth.uid() and operation=p_operation and idempotency_key=p_key $$;

create or replace function public.guard_competition_settlement_mutation() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin if current_setting('selpa.competition_settlement_write',true) is distinct from 'allowed' then raise exception 'SETTLEMENT_RPC_REQUIRED' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and old.status in('PUBLISHED','REJECTED','SUPERSEDED') then raise exception 'SETTLEMENT_TERMINAL' using errcode='23514'; end if; return new;
end $$;
create trigger trg_guard_competition_settlements before update or delete on public.competition_event_settlements for each row execute function public.guard_competition_settlement_mutation();
create trigger trg_guard_competition_settlement_awards before update or delete on public.competition_event_settlement_awards for each row execute function public.guard_competition_settlement_mutation();
create trigger trg_guard_competition_settlement_issues before update or delete on public.competition_event_settlement_issues for each row execute function public.guard_competition_settlement_mutation();

create or replace function public.get_competition_event_settlement_preflight(p_club_id uuid,p_settlement_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.competition_event_settlements%rowtype; h public.competition_event_homologations%rowtype; blockers jsonb:='[]'; warnings jsonb:='[]'; award_count int; actor uuid;
begin actor:=public.require_competition_settlement_access(p_club_id,false); select * into s from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  select * into h from public.competition_event_homologations where club_id=p_club_id and id=s.homologation_id;
  if h.status<>'APPROVED' then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','HOMOLOGATION_NOT_APPROVED')); end if;
  if h.revision<>s.homologation_revision then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','HOMOLOGATION_STALE')); end if;
  select count(*) into award_count from public.competition_event_settlement_awards where settlement_id=s.id;
  if s.status<>'DRAFT' and award_count=0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','AWARDS_MISSING')); end if;
  if exists(select 1 from public.competition_event_settlement_issues where settlement_id=s.id and severity='BLOCKER') then blockers:=blockers||(select coalesce(jsonb_agg(jsonb_build_object('code',i.code,'message',i.message)),'[]') from public.competition_event_settlement_issues i where i.settlement_id=s.id and i.severity='BLOCKER'); end if;
  warnings:=(select coalesce(jsonb_agg(jsonb_build_object('code',i.code,'message',i.message)),'[]') from public.competition_event_settlement_issues i where i.settlement_id=s.id and i.severity='WARNING');
  return jsonb_build_object('settlement_id',s.id,'status',s.status,'revision',s.revision,'blockers',blockers,'warnings',warnings,'allowed_actions',jsonb_build_object('calculate',s.status in('DRAFT','CALCULATED'),'submit',s.status='CALCULATED' and jsonb_array_length(blockers)=0,'approve',s.status='SUBMITTED' and jsonb_array_length(blockers)=0,'reject',s.status='SUBMITTED','publish',s.status='APPROVED' and jsonb_array_length(blockers)=0,'correction',s.status='REJECTED','supersede',s.status in('DRAFT','CALCULATED','SUBMITTED','APPROVED')));
end $$;

create or replace function public.create_competition_event_settlement_draft(p_club_id uuid,p_event_division_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; d public.competition_series_event_divisions%rowtype; h public.competition_event_homologations%rowtype; s public.competition_event_settlements%rowtype; replay jsonb; next_version int;
begin actor:=public.require_competition_settlement_access(p_club_id,false); if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if; select * into d from public.competition_series_event_divisions where club_id=p_club_id and id=p_event_division_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  replay:=public.begin_competition_settlement_command(p_club_id,d.id,null,'CREATE',p_idempotency_key,jsonb_build_object('division',d.id)); if replay is not null then return replay; end if;
  select * into h from public.competition_event_homologations where club_id=p_club_id and event_division_id=d.id and status='APPROVED' for update; if not found then raise exception 'HOMOLOGATION_NOT_APPROVED' using errcode='23514'; end if;
  if exists(select 1 from public.competition_event_settlements where event_division_id=d.id and status in('DRAFT','CALCULATED','SUBMITTED','APPROVED')) then raise exception 'SETTLEMENT_EDITABLE_EXISTS' using errcode='23505'; end if;
  select coalesce(max(version),0)+1 into next_version from public.competition_event_settlements where event_division_id=d.id;
  perform set_config('selpa.competition_settlement_write','allowed',true);
  insert into public.competition_event_settlements(club_id,event_id,event_division_id,homologation_id,homologation_revision,version,scoring_mode,series_rule_id,event_tier_id,points_scheme_id,effective_multiplier,calculation_snapshot,created_by)
  select p_club_id,d.event_id,d.id,h.id,h.revision,next_version,d.scoring_mode,d.series_rule_id,d.event_tier_id,
    case when d.scoring_mode='POINTS' then (d.configuration_snapshot->>'effective_points_scheme_id')::uuid end,
    coalesce((d.configuration_snapshot->>'effective_multiplier')::numeric,1),
    jsonb_build_object('event_configuration',d.configuration_snapshot,'points_rules',coalesce((select jsonb_agg(jsonb_build_object('rule_key',pr.rule_key,'points',pr.points) order by pr.rule_key) from public.points_scheme_rules pr where pr.scheme_id=(d.configuration_snapshot->>'effective_points_scheme_id')::uuid),'[]'::jsonb),'series_rule',jsonb_build_object('id',sr.id,'version',sr.version,'bonus_rules',sr.bonus_rules,'penalty_rules',sr.penalty_rules),'homologation_id',h.id,'homologation_revision',h.revision,'rounding','ROUND_NEAREST_INTEGER') ,actor
  from public.competition_series_rules sr where sr.id=d.series_rule_id and sr.club_id=p_club_id returning * into s;
  replay:=jsonb_build_object('settlement_id',s.id,'version',s.version,'revision',s.revision,'status',s.status); perform public.finish_competition_settlement_command(p_club_id,d.id,'CREATE',p_idempotency_key,replay); return replay;
end $$;

create or replace function public.calculate_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; s public.competition_event_settlements%rowtype; h public.competition_event_homologations%rowtype; replay jsonb; missing int;
begin actor:=public.require_competition_settlement_access(p_club_id,false); if not public.is_platform_admin() and not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if; select * into s from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  replay:=public.begin_competition_settlement_command(p_club_id,s.event_division_id,s.id,'CALCULATE',p_idempotency_key,jsonb_build_object('settlement',s.id,'revision',p_revision)); if replay is not null then return replay; end if; if s.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if; if s.status not in('DRAFT','CALCULATED') then raise exception 'INVALID_LIFECYCLE' using errcode='23514'; end if;
  select * into h from public.competition_event_homologations where id=s.homologation_id and club_id=p_club_id; if h.status<>'APPROVED' or h.revision<>s.homologation_revision then raise exception 'HOMOLOGATION_STALE' using errcode='23514'; end if;
  perform set_config('selpa.competition_settlement_write','allowed',true); delete from public.competition_event_settlement_issues where settlement_id=s.id; delete from public.competition_event_settlement_awards where settlement_id=s.id;
  insert into public.competition_event_settlement_awards(club_id,settlement_id,player_id,club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,base_points,multiplier,bonus_points,penalty_points,total_points,scoring_eligibility_status,excluded_reason,calculation_detail)
  select p_club_id,s.id,p.player_id,p.club_player_id,p.competition_player_entry_id,p.id,p.final_position,p.result_role,
    case when s.scoring_mode='NON_SCORING' or p.scoring_eligibility_status<>'ELIGIBLE' then 0 else coalesce((r.value->>'points')::integer,0) end,s.effective_multiplier,
    case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then coalesce((s.calculation_snapshot->'series_rule'->'bonus_rules'->>p.result_role)::integer,0) else 0 end,
    case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then -abs(coalesce((s.calculation_snapshot->'series_rule'->'penalty_rules'->>p.result_role)::integer,0)) else 0 end,
    round(((case when s.scoring_mode='NON_SCORING' or p.scoring_eligibility_status<>'ELIGIBLE' then 0 else coalesce((r.value->>'points')::integer,0) end)+case when s.scoring_mode='POINTS' and p.scoring_eligibility_status='ELIGIBLE' then coalesce((s.calculation_snapshot->'series_rule'->'bonus_rules'->>p.result_role)::integer,0)-abs(coalesce((s.calculation_snapshot->'series_rule'->'penalty_rules'->>p.result_role)::integer,0)) else 0 end)*s.effective_multiplier)::integer,
    case when s.scoring_mode='NON_SCORING' then 'NON_SCORING' else p.scoring_eligibility_status end,case when s.scoring_mode='NON_SCORING' then 'NON_SCORING_EVENT' when p.scoring_eligibility_status<>'ELIGIBLE' then p.exclusion_reason end,
    jsonb_build_object('rule_key',p.result_role,'rule_found',r.value is not null,'rounding','ROUND_NEAREST_INTEGER','homologation_revision',h.revision)
  from public.competition_event_homologation_participants p
  left join lateral jsonb_array_elements(coalesce(s.calculation_snapshot->'points_rules','[]'::jsonb)) r(value) on upper(r.value->>'rule_key')=upper(p.result_role)
  where p.homologation_id=h.id;
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'RESULT_RULE_MISSING','BLOCKER','PLAYER',a.player_id,'No existe una regla congelada aplicable al resultado homologado.' from public.competition_event_settlement_awards a where a.settlement_id=s.id and s.scoring_mode='POINTS' and a.scoring_eligibility_status='ELIGIBLE' and coalesce((a.calculation_detail->>'rule_found')::boolean,false)=false;
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'NON_SCORING_PARTICIPANT','WARNING','PLAYER',a.player_id,'El participante no adjudica puntos.' from public.competition_event_settlement_awards a where a.settlement_id=s.id and a.scoring_eligibility_status<>'ELIGIBLE';
  insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,entity_type,entity_id,message)
  select p_club_id,s.id,'ELIGIBLE_ENTRY_INVALID','BLOCKER','PLAYER',a.player_id,'El participante elegible no posee una entrada activa del recorrido congelado.'
  from public.competition_event_settlement_awards a
  left join public.competition_player_entries pe on pe.id=a.competition_player_entry_id and pe.club_id=p_club_id
  join public.competition_series_event_divisions ed on ed.id=s.event_division_id
  join public.competition_series_divisions sd on sd.id=ed.series_division_id
  where a.settlement_id=s.id and a.scoring_eligibility_status='ELIGIBLE'
    and (pe.id is null or pe.status<>'ACTIVE' or pe.valid_until is not null or pe.division_id<>sd.division_id or pe.club_player_id<>a.club_player_id);
  if s.scoring_mode='POINTS' and (s.points_scheme_id is null or jsonb_array_length(coalesce(s.calculation_snapshot->'points_rules','[]'::jsonb))=0) then
    insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,message) values(p_club_id,s.id,'POINTS_CONFIGURATION_INVALID','BLOCKER','El esquema efectivo congelado no contiene reglas.');
  end if;
  select count(*) into missing from public.competition_event_homologation_participants where homologation_id=h.id; if missing=0 then insert into public.competition_event_settlement_issues(club_id,settlement_id,code,severity,message) values(p_club_id,s.id,'PARTICIPANTS_MISSING','BLOCKER','La homologación no tiene participantes.'); end if;
  update public.competition_event_settlements set status='CALCULATED',revision=revision+1,calculated_by=actor,calculated_at=now(),calculation_snapshot=calculation_snapshot||jsonb_build_object('result_snapshot',h.result_snapshot,'eligibility_snapshot',h.eligibility_snapshot,'calculated_at',now()),updated_at=now() where id=s.id returning * into s;
  replay:=jsonb_build_object('settlement_id',s.id,'revision',s.revision,'status',s.status); perform public.finish_competition_settlement_command(p_club_id,s.event_division_id,'CALCULATE',p_idempotency_key,replay); return replay;
end $$;

create or replace function public.transition_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_operation text,p_idempotency_key text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; s public.competition_event_settlements%rowtype; op text:=upper(p_operation); replay jsonb; pf jsonb; reason text:=nullif(btrim(p_payload->>'reason'),'');
begin actor:=public.require_competition_settlement_access(p_club_id,op in('APPROVE','REJECT','PUBLISH','SUPERSEDE')); if op='SUBMIT' and not public.is_platform_admin() and not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if; select * into s from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  replay:=public.begin_competition_settlement_command(p_club_id,s.event_division_id,s.id,op,p_idempotency_key,jsonb_build_object('settlement',s.id,'revision',p_revision,'payload',p_payload)); if replay is not null then return replay; end if; if s.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if;
  pf:=public.get_competition_event_settlement_preflight(p_club_id,s.id); perform set_config('selpa.competition_settlement_write','allowed',true);
  if op='SUBMIT' then if s.status<>'CALCULATED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if; update public.competition_event_settlements set status='SUBMITTED',submitted_by=actor,submitted_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='APPROVE' then if s.status<>'SUBMITTED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if; update public.competition_event_settlements set status='APPROVED',approved_by=actor,approved_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='REJECT' then if s.status<>'SUBMITTED' or reason is null then raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023'; end if; update public.competition_event_settlements set status='REJECTED',rejected_by=actor,rejected_at=now(),rejection_reason=reason,revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='SUPERSEDE' then if s.status not in('DRAFT','CALCULATED','SUBMITTED','APPROVED') or reason is null then raise exception 'INVALID_LIFECYCLE' using errcode='23514'; end if; update public.competition_event_settlements set status='SUPERSEDED',superseded_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  elsif op='PUBLISH' then
    if s.status<>'APPROVED' or jsonb_array_length(pf->'blockers')>0 then raise exception 'PREFLIGHT_BLOCKED' using errcode='23514'; end if;
    perform set_config('selpa.competition_points_write','allowed',true);
    insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,effective_at,reason,rule_snapshot,metadata,created_by)
    select s.club_id,cd.season_id,sd.division_id,a.competition_player_entry_id,a.club_player_id,'TOURNAMENT_RESULT','TOURNAMENT',h.tournament_id,'COMPETITION_EVENT_SETTLEMENT','settlement:'||s.id||':award:'||a.id,a.total_points,coalesce(e.actual_ends_at,e.planned_ends_at,now()),'Settlement publicado',a.calculation_detail,
      jsonb_build_object('settlement_id',s.id,'award_id',a.id,'homologation_id',s.homologation_id,'event_id',s.event_id,'event_division_id',s.event_division_id,'tournament_id',h.tournament_id,'final_position',a.final_position,'result_code',a.result_code,'base_points',a.base_points,'multiplier',a.multiplier,'bonus',a.bonus_points,'penalty',a.penalty_points,'settlement_version',s.version),actor
    from public.competition_event_settlement_awards a join public.competition_event_homologations h on h.id=s.homologation_id join public.competition_series_events e on e.id=s.event_id join public.competition_series_event_divisions ed on ed.id=s.event_division_id join public.competition_series_divisions sd on sd.id=ed.series_division_id join public.competition_divisions cd on cd.id=sd.division_id
    where a.settlement_id=s.id and a.total_points<>0 and a.scoring_eligibility_status='ELIGIBLE';
    update public.competition_event_settlements set status='PUBLISHED',published_by=actor,published_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
  else raise exception 'UNKNOWN_OPERATION' using errcode='22023'; end if;
  replay:=jsonb_build_object('settlement_id',s.id,'revision',s.revision,'status',s.status); perform public.finish_competition_settlement_command(p_club_id,s.event_division_id,op,p_idempotency_key,replay); return replay;
end $$;

create or replace function public.submit_competition_event_settlement(uuid,uuid,integer,text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_settlement($1,$2,$3,'SUBMIT',$4,'{}') $$;
create or replace function public.approve_competition_event_settlement(uuid,uuid,integer,text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_settlement($1,$2,$3,'APPROVE',$4,'{}') $$;
create or replace function public.publish_competition_event_settlement(uuid,uuid,integer,text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_settlement($1,$2,$3,'PUBLISH',$4,'{}') $$;
create or replace function public.reject_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_idempotency_key text,p_reason text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_settlement(p_club_id,p_settlement_id,p_revision,'REJECT',p_idempotency_key,jsonb_build_object('reason',p_reason)) $$;
create or replace function public.supersede_competition_event_settlement(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_idempotency_key text,p_reason text) returns jsonb language sql security definer set search_path=pg_catalog,public as $$ select public.transition_competition_event_settlement(p_club_id,p_settlement_id,p_revision,'SUPERSEDE',p_idempotency_key,jsonb_build_object('reason',p_reason)) $$;
create or replace function public.create_competition_event_settlement_correction(p_club_id uuid,p_settlement_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$ declare old public.competition_event_settlements%rowtype; result jsonb; begin perform public.require_competition_settlement_access(p_club_id,true); select * into old from public.competition_event_settlements where club_id=p_club_id and id=p_settlement_id for update; if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if; if old.revision<>p_revision then raise exception 'PRECONDITION_FAILED' using errcode='40001'; end if; if old.status<>'REJECTED' then raise exception 'INVALID_LIFECYCLE' using errcode='23514'; end if; result:=public.create_competition_event_settlement_draft(p_club_id,old.event_division_id,p_idempotency_key); perform set_config('selpa.competition_settlement_write','allowed',true); update public.competition_event_settlements set corrected_from_id=old.id where id=(result->>'settlement_id')::uuid; return result; end $$;

alter table public.competition_event_settlements enable row level security; alter table public.competition_event_settlement_awards enable row level security; alter table public.competition_event_settlement_issues enable row level security; alter table public.competition_event_settlement_commands enable row level security;
revoke all on table public.competition_event_settlements,public.competition_event_settlement_awards,public.competition_event_settlement_issues,public.competition_event_settlement_commands from public,anon,authenticated;
create policy competition_settlements_select on public.competition_event_settlements for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_settlement_awards_select on public.competition_event_settlement_awards for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
create policy competition_settlement_issues_select on public.competition_event_settlement_issues for select to authenticated using(public.is_platform_admin() or public.has_club_capability(club_id,'competition:view'));
revoke all on function public.create_competition_event_settlement_draft(uuid,uuid,text),public.calculate_competition_event_settlement(uuid,uuid,integer,text),public.get_competition_event_settlement_preflight(uuid,uuid),public.submit_competition_event_settlement(uuid,uuid,integer,text),public.approve_competition_event_settlement(uuid,uuid,integer,text),public.reject_competition_event_settlement(uuid,uuid,integer,text,text),public.publish_competition_event_settlement(uuid,uuid,integer,text),public.create_competition_event_settlement_correction(uuid,uuid,integer,text),public.supersede_competition_event_settlement(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.create_competition_event_settlement_draft(uuid,uuid,text),public.calculate_competition_event_settlement(uuid,uuid,integer,text),public.get_competition_event_settlement_preflight(uuid,uuid),public.submit_competition_event_settlement(uuid,uuid,integer,text),public.approve_competition_event_settlement(uuid,uuid,integer,text),public.reject_competition_event_settlement(uuid,uuid,integer,text,text),public.publish_competition_event_settlement(uuid,uuid,integer,text),public.create_competition_event_settlement_correction(uuid,uuid,integer,text),public.supersede_competition_event_settlement(uuid,uuid,integer,text,text) to authenticated,service_role;
revoke all on function public.require_competition_settlement_access(uuid,boolean),public.begin_competition_settlement_command(uuid,uuid,uuid,text,text,jsonb),public.finish_competition_settlement_command(uuid,uuid,text,text,jsonb),public.transition_competition_event_settlement(uuid,uuid,integer,text,text,jsonb),public.guard_competition_settlement_mutation() from public,anon,authenticated;

comment on table public.competition_event_settlements is 'Agregado versionado que adjudica una homologación APPROVED y publica puntos atómicamente.';
comment on table public.competition_event_settlement_awards is 'Adjudicaciones individuales normalizadas; cero puntos no genera ledger.';
commit;
