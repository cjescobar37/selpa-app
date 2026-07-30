begin;

-- Stage 5A.2 correction: competition_series.revision is the aggregate token.
-- Child mutations validate it and advance it exactly once when they change state.

do $$ begin
  if to_regprocedure('public.create_competition_series_rule_version(uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.set_competition_series_eligibility(uuid,uuid,integer,jsonb)') is null then
    raise exception 'Primero debe aplicarse 20260730170000_competition_series_stage5a2.sql';
  end if;
end $$;

revoke all on function public.create_competition_series_rule_version(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.update_competition_series_rule_draft(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.set_competition_series_eligibility(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.activate_competition_series_rule_version(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.delete_competition_series_rule_draft(uuid,uuid,integer) from public,anon,authenticated,service_role;

create or replace function public.create_competition_series_rule_version(
  p_club_id uuid, p_series_id uuid, p_series_revision integer,
  p_series_division_id uuid, p_points_scheme_id uuid, p_clone_rule_id uuid default null
)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_result public.competition_series_rules%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if not exists(select 1 from public.competition_series_divisions d where d.id=p_series_division_id and d.series_id=p_series_id and d.club_id=p_club_id) then
    raise exception 'División del circuito inexistente.' using errcode='P0002';
  end if;
  select * into v_result from public.create_competition_series_rule_version(p_club_id,p_series_division_id,p_points_scheme_id,p_clone_rule_id);
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set updated_at=now() where id=p_series_id;
  return v_result;
end;
$$;

create or replace function public.update_competition_series_rule_draft(
  p_club_id uuid, p_series_id uuid, p_series_revision integer,
  p_rule_id uuid, p_rule_revision integer, p_config jsonb
)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_result public.competition_series_rules%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if not exists(select 1 from public.competition_series_rules r join public.competition_series_divisions d on d.id=r.series_division_id where r.id=p_rule_id and d.series_id=p_series_id and r.club_id=p_club_id) then
    raise exception 'Regla inexistente.' using errcode='P0002';
  end if;
  select * into v_result from public.update_competition_series_rule_draft(p_club_id,p_rule_id,p_rule_revision,p_config);
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set updated_at=now() where id=p_series_id;
  return v_result;
end;
$$;

create or replace function public.set_competition_series_eligibility(
  p_club_id uuid, p_series_id uuid, p_series_revision integer,
  p_rule_id uuid, p_eligibility_revision integer, p_config jsonb
)
returns public.competition_series_eligibility
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_result public.competition_series_eligibility%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  if not exists(select 1 from public.competition_series_rules r join public.competition_series_divisions d on d.id=r.series_division_id where r.id=p_rule_id and d.series_id=p_series_id and r.club_id=p_club_id) then
    raise exception 'Regla inexistente.' using errcode='P0002';
  end if;
  select * into v_result from public.set_competition_series_eligibility(p_club_id,p_rule_id,p_eligibility_revision,p_config);
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set updated_at=now() where id=p_series_id;
  return v_result;
end;
$$;

create or replace function public.activate_competition_series_rule_version(
  p_club_id uuid, p_series_id uuid, p_series_revision integer,
  p_rule_id uuid, p_rule_revision integer
)
returns public.competition_series_rules
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype; v_rule public.competition_series_rules%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  select r.* into v_rule from public.competition_series_rules r join public.competition_series_divisions d on d.id=r.series_division_id
    where r.id=p_rule_id and d.series_id=p_series_id and r.club_id=p_club_id for update of r;
  if not found then raise exception 'Regla inexistente.' using errcode='P0002'; end if;
  if v_rule.status='ACTIVE' then return v_rule; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  select * into v_rule from public.activate_competition_series_rule_version(p_club_id,p_rule_id,p_rule_revision);
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set updated_at=now() where id=p_series_id;
  return v_rule;
end;
$$;

create or replace function public.delete_competition_series_rule_draft(
  p_club_id uuid, p_series_id uuid, p_series_revision integer,
  p_rule_id uuid, p_rule_revision integer
)
returns uuid
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_series public.competition_series%rowtype;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_series from public.competition_series where id=p_series_id and club_id=p_club_id for update;
  if not found then raise exception 'Circuito inexistente.' using errcode='P0002'; end if;
  if not exists(select 1 from public.competition_series_rules r join public.competition_series_divisions d on d.id=r.series_division_id where r.id=p_rule_id and d.series_id=p_series_id and r.club_id=p_club_id) then return p_rule_id; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  perform public.delete_competition_series_rule_draft(p_club_id,p_rule_id,p_rule_revision);
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series set updated_at=now() where id=p_series_id;
  return p_rule_id;
end;
$$;

revoke all on function public.create_competition_series_rule_version(uuid,uuid,integer,uuid,uuid,uuid) from public,anon;
revoke all on function public.update_competition_series_rule_draft(uuid,uuid,integer,uuid,integer,jsonb) from public,anon;
revoke all on function public.set_competition_series_eligibility(uuid,uuid,integer,uuid,integer,jsonb) from public,anon;
revoke all on function public.activate_competition_series_rule_version(uuid,uuid,integer,uuid,integer) from public,anon;
revoke all on function public.delete_competition_series_rule_draft(uuid,uuid,integer,uuid,integer) from public,anon;
grant execute on function public.create_competition_series_rule_version(uuid,uuid,integer,uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.update_competition_series_rule_draft(uuid,uuid,integer,uuid,integer,jsonb) to authenticated,service_role;
grant execute on function public.set_competition_series_eligibility(uuid,uuid,integer,uuid,integer,jsonb) to authenticated,service_role;
grant execute on function public.activate_competition_series_rule_version(uuid,uuid,integer,uuid,integer) to authenticated,service_role;
grant execute on function public.delete_competition_series_rule_draft(uuid,uuid,integer,uuid,integer) to authenticated,service_role;

-- Retirar una asociación ya retirada es idempotente y no toca ninguna revisión.
create or replace function public.remove_competition_series_division(
  p_club_id uuid, p_series_division_id uuid, p_series_revision integer
)
returns public.competition_series_divisions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_link public.competition_series_divisions%rowtype; v_series public.competition_series%rowtype; v_actor uuid;
begin
  perform public.require_competition_series_access(p_club_id,'competition:manage');
  select * into v_link from public.competition_series_divisions where id=p_series_division_id and club_id=p_club_id for update;
  if not found then raise exception 'División del circuito inexistente.' using errcode='P0002'; end if;
  select * into v_series from public.competition_series where id=v_link.series_id for update;
  v_actor:=public.require_competition_series_access(v_series.club_id,'competition:manage');
  if not v_link.is_active then return v_link; end if;
  if v_series.status not in ('DRAFT','SCHEDULED') or v_link.frozen_at is not null then raise exception 'La estructura está congelada.' using errcode='23514'; end if;
  if v_series.revision<>p_series_revision then raise exception 'Revisión obsoleta.' using errcode='40001'; end if;
  perform set_config('selpa.competition_series_write','allowed',true);
  update public.competition_series_divisions set is_active=false,removed_at=now(),removed_by=v_actor where id=v_link.id returning * into v_link;
  update public.competition_series set updated_at=now() where id=v_series.id;
  return v_link;
end;
$$;

commit;
