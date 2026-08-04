begin;

alter table public.points_schemes
  add column if not exists revision integer not null default 1,
  add column if not exists archived_at timestamptz;
alter table public.points_scheme_rules
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists revision integer not null default 1,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.points_schemes drop constraint if exists points_schemes_revision_chk;
alter table public.points_schemes add constraint points_schemes_revision_chk check(revision > 0);
alter table public.points_scheme_rules drop constraint if exists points_scheme_rules_revision_chk;
alter table public.points_scheme_rules add constraint points_scheme_rules_revision_chk check(revision > 0);
alter table public.points_scheme_rules drop constraint if exists points_scheme_rules_sort_chk;
alter table public.points_scheme_rules add constraint points_scheme_rules_sort_chk check(sort_order >= 0);
alter table public.points_scheme_rules drop constraint if exists points_scheme_rules_config_chk;
alter table public.points_scheme_rules add constraint points_scheme_rules_config_chk check(jsonb_typeof(config) = 'object');

create unique index if not exists points_schemes_club_active_name_uidx
  on public.points_schemes(club_id, lower(btrim(name))) where club_id is not null and archived_at is null;
create index if not exists points_scheme_rules_active_order_idx
  on public.points_scheme_rules(scheme_id, sort_order, rule_key) where is_active;

drop trigger if exists trg_points_schemes_updated_at on public.points_schemes;
create trigger trg_points_schemes_updated_at before update on public.points_schemes
for each row execute function public.set_updated_at();
drop trigger if exists trg_points_scheme_rules_updated_at on public.points_scheme_rules;
create trigger trg_points_scheme_rules_updated_at before update on public.points_scheme_rules
for each row execute function public.set_updated_at();

create or replace function public.require_points_scheme_access(p_club_id uuid, p_activation boolean default false)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid:=auth.uid(); actor_role text;
begin
  if actor is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if public.is_platform_admin() then return actor; end if;
  if not public.has_club_capability(p_club_id,'competition:manage') then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_activation then
    select membership.role::text into actor_role from public.club_memberships membership
    where membership.club_id=p_club_id and membership.user_id=actor and membership.status='APPROVED' and membership.approved_at is not null;
    if actor_role is null or actor_role not in ('OWNER','ADMIN') then raise exception 'ACTIVATION_FORBIDDEN' using errcode='42501'; end if;
  end if;
  return actor;
end;$$;

create or replace function public.assert_points_scheme_editable(p_club_id uuid,p_scheme_id uuid)
returns public.points_schemes language plpgsql security definer set search_path=pg_catalog,public as $$
declare scheme public.points_schemes%rowtype;
begin
  select * into scheme from public.points_schemes where id=p_scheme_id and club_id=p_club_id and not is_global and archived_at is null for update;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode='P0002'; end if;
  if exists(select 1 from public.competition_series_rules rule where rule.points_scheme_id=scheme.id and (rule.status='ACTIVE' or rule.frozen_at is not null)) then
    raise exception 'SCHEME_IN_USE_CLONE_REQUIRED' using errcode='23514';
  end if;
  return scheme;
end;$$;

create or replace function public.create_points_scheme(p_club_id uuid,p_name text,p_description text default null)
returns public.points_schemes language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; result public.points_schemes%rowtype; clean_name text:=btrim(coalesce(p_name,''));
begin
  actor:=public.require_points_scheme_access(p_club_id,false);
  if clean_name='' then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  insert into public.points_schemes(club_id,name,description,is_global,is_active,created_by)
  values(p_club_id,clean_name,nullif(btrim(coalesce(p_description,'')),''),false,false,actor) returning * into result;
  return result;
end;$$;

create or replace function public.update_points_scheme(p_club_id uuid,p_scheme_id uuid,p_revision integer,p_name text,p_description text default null)
returns public.points_schemes language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_row public.points_schemes%rowtype; result public.points_schemes%rowtype; clean_name text:=btrim(coalesce(p_name,'')); clean_description text:=nullif(btrim(coalesce(p_description,'')),'');
begin
  perform public.require_points_scheme_access(p_club_id,false); current_row:=public.assert_points_scheme_editable(p_club_id,p_scheme_id);
  if current_row.revision is distinct from p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if clean_name='' then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  if row(current_row.name,current_row.description) is not distinct from row(clean_name,clean_description) then return current_row; end if;
  update public.points_schemes set name=clean_name,description=clean_description,revision=revision+1 where id=p_scheme_id returning * into result; return result;
end;$$;

create or replace function public.set_points_scheme_active(p_club_id uuid,p_scheme_id uuid,p_revision integer,p_active boolean)
returns public.points_schemes language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_row public.points_schemes%rowtype; result public.points_schemes%rowtype;
begin
  perform public.require_points_scheme_access(p_club_id,true);
  select * into current_row from public.points_schemes where id=p_scheme_id and club_id=p_club_id and not is_global and archived_at is null for update;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode='P0002'; end if;
  if current_row.revision is distinct from p_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if current_row.is_active=p_active then return current_row; end if;
  if p_active and not exists(select 1 from public.points_scheme_rules rule where rule.scheme_id=p_scheme_id and rule.is_active) then raise exception 'SCHEME_RULES_REQUIRED' using errcode='23514'; end if;
  update public.points_schemes set is_active=p_active,revision=revision+1 where id=p_scheme_id returning * into result; return result;
end;$$;

create or replace function public.clone_points_scheme(p_club_id uuid,p_scheme_id uuid,p_name text)
returns public.points_schemes language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; source public.points_schemes%rowtype; result public.points_schemes%rowtype; clean_name text:=btrim(coalesce(p_name,''));
begin
  actor:=public.require_points_scheme_access(p_club_id,false);
  select * into source from public.points_schemes where id=p_scheme_id and (club_id=p_club_id or (is_global and is_active)) and archived_at is null;
  if not found then raise exception 'SCHEME_NOT_FOUND' using errcode='P0002'; end if;
  if clean_name='' then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  insert into public.points_schemes(club_id,name,description,is_global,is_active,created_by) values(p_club_id,clean_name,source.description,false,false,actor) returning * into result;
  insert into public.points_scheme_rules(scheme_id,rule_key,points,sort_order,is_active,config,created_by)
    select result.id,rule.rule_key,rule.points,rule.sort_order,rule.is_active,rule.config,actor from public.points_scheme_rules rule where rule.scheme_id=source.id and rule.is_active;
  return result;
end;$$;

create or replace function public.add_points_scheme_rule(p_club_id uuid,p_scheme_id uuid,p_scheme_revision integer,p_rule_key text,p_points integer,p_sort_order integer default 0)
returns public.points_scheme_rules language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; scheme public.points_schemes%rowtype; result public.points_scheme_rules%rowtype; key text:=upper(btrim(coalesce(p_rule_key,'')));
begin
  actor:=public.require_points_scheme_access(p_club_id,false); scheme:=public.assert_points_scheme_editable(p_club_id,p_scheme_id);
  if scheme.revision is distinct from p_scheme_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if key not in ('CHAMPION','RUNNER_UP','SEMIFINALIST','QUARTERFINALIST','PARTICIPANT') then raise exception 'RULE_KEY_INVALID' using errcode='22023'; end if;
  if p_points is null or p_sort_order is null or p_points<0 or p_sort_order<0 then raise exception 'RULE_VALUE_INVALID' using errcode='22023'; end if;
  insert into public.points_scheme_rules(scheme_id,rule_key,points,sort_order,is_active,created_by) values(p_scheme_id,key,p_points,p_sort_order,true,actor) returning * into result;
  update public.points_schemes set revision=revision+1 where id=p_scheme_id; return result;
end;$$;

create or replace function public.update_points_scheme_rule(p_club_id uuid,p_scheme_id uuid,p_rule_id uuid,p_scheme_revision integer,p_rule_revision integer,p_points integer,p_sort_order integer,p_is_active boolean)
returns public.points_scheme_rules language plpgsql security definer set search_path=pg_catalog,public as $$
declare scheme public.points_schemes%rowtype; current_row public.points_scheme_rules%rowtype; result public.points_scheme_rules%rowtype;
begin
  perform public.require_points_scheme_access(p_club_id,false); scheme:=public.assert_points_scheme_editable(p_club_id,p_scheme_id);
  if scheme.revision is distinct from p_scheme_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  select * into current_row from public.points_scheme_rules where id=p_rule_id and scheme_id=p_scheme_id for update;
  if not found then raise exception 'RULE_NOT_FOUND' using errcode='P0002'; end if;
  if current_row.revision is distinct from p_rule_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if p_points is null or p_sort_order is null or p_points<0 or p_sort_order<0 then raise exception 'RULE_VALUE_INVALID' using errcode='22023'; end if;
  if row(current_row.points,current_row.sort_order,current_row.is_active) is not distinct from row(p_points,p_sort_order,p_is_active) then return current_row; end if;
  update public.points_scheme_rules set points=p_points,sort_order=p_sort_order,is_active=p_is_active,revision=revision+1 where id=p_rule_id returning * into result;
  update public.points_schemes set revision=revision+1 where id=p_scheme_id; return result;
end;$$;

create or replace function public.deactivate_points_scheme_rule(p_club_id uuid,p_scheme_id uuid,p_rule_id uuid,p_scheme_revision integer,p_rule_revision integer)
returns public.points_scheme_rules language plpgsql security definer set search_path=pg_catalog,public as $$
declare scheme public.points_schemes%rowtype; current_row public.points_scheme_rules%rowtype; result public.points_scheme_rules%rowtype;
begin
  perform public.require_points_scheme_access(p_club_id,false); scheme:=public.assert_points_scheme_editable(p_club_id,p_scheme_id);
  if scheme.revision is distinct from p_scheme_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  select * into current_row from public.points_scheme_rules rule where rule.id=p_rule_id and rule.scheme_id=p_scheme_id for update;
  if not found then raise exception 'RULE_NOT_FOUND' using errcode='P0002'; end if;
  if current_row.revision is distinct from p_rule_revision then raise exception 'STALE_REVISION' using errcode='40001'; end if;
  if not current_row.is_active then return current_row; end if;
  update public.points_scheme_rules set is_active=false,revision=revision+1 where id=p_rule_id returning * into result;
  update public.points_schemes set revision=revision+1 where id=p_scheme_id;
  return result;
end;$$;

alter table public.points_schemes enable row level security;
alter table public.points_scheme_rules enable row level security;
drop policy if exists points_schemes_select_platform_or_club on public.points_schemes;
drop policy if exists points_schemes_admin_read on public.points_schemes;
create policy points_schemes_admin_read on public.points_schemes for select to authenticated using(public.is_platform_admin() or (is_global and is_active and archived_at is null) or (club_id is not null and public.has_club_capability(club_id,'competition:view')));
drop policy if exists points_scheme_rules_select_platform_or_club on public.points_scheme_rules;
drop policy if exists points_scheme_rules_admin_read on public.points_scheme_rules;
create policy points_scheme_rules_admin_read on public.points_scheme_rules for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.points_schemes scheme where scheme.id=points_scheme_rules.scheme_id and ((scheme.is_global and scheme.is_active and scheme.archived_at is null) or (scheme.club_id is not null and public.has_club_capability(scheme.club_id,'competition:view')))));
revoke insert,update,delete on public.points_schemes,public.points_scheme_rules from authenticated,anon;
grant select on public.points_schemes,public.points_scheme_rules to authenticated;

revoke all on function public.require_points_scheme_access(uuid,boolean),public.assert_points_scheme_editable(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_points_scheme_access(uuid,boolean),public.assert_points_scheme_editable(uuid,uuid) to service_role;
revoke all on function public.create_points_scheme(uuid,text,text),public.update_points_scheme(uuid,uuid,integer,text,text),public.set_points_scheme_active(uuid,uuid,integer,boolean),public.clone_points_scheme(uuid,uuid,text),public.add_points_scheme_rule(uuid,uuid,integer,text,integer,integer),public.update_points_scheme_rule(uuid,uuid,uuid,integer,integer,integer,integer,boolean),public.deactivate_points_scheme_rule(uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.create_points_scheme(uuid,text,text),public.update_points_scheme(uuid,uuid,integer,text,text),public.set_points_scheme_active(uuid,uuid,integer,boolean),public.clone_points_scheme(uuid,uuid,text),public.add_points_scheme_rule(uuid,uuid,integer,text,integer,integer),public.update_points_scheme_rule(uuid,uuid,uuid,integer,integer,integer,integer,boolean),public.deactivate_points_scheme_rule(uuid,uuid,uuid,integer,integer) to authenticated,service_role;

commit;
