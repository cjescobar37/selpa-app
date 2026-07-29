begin;

do $$
begin
  if to_regprocedure('public.is_valid_competition_age_reference_config(text,jsonb)') is null then
    raise exception 'Primero debe aplicarse 20260729_competition_catalogs_stage5a1.sql';
  end if;
end
$$;

create or replace function public.is_valid_competition_age_reference_config(
  p_rule text,
  p_config jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_date text;
  v_key_count integer;
begin
  if jsonb_typeof(p_config) is distinct from 'object' then
    return false;
  end if;

  if p_rule <> 'FIXED_DATE' then
    return p_config = '{}'::jsonb;
  end if;

  select count(*)::integer
  into v_key_count
  from pg_catalog.jsonb_object_keys(p_config);

  if v_key_count <> 1 or not (p_config ? 'date') then
    return false;
  end if;

  v_date := p_config ->> 'date';
  if v_date is null or v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  perform v_date::date;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then
  return false;
end;
$$;

revoke all on function public.is_valid_competition_age_reference_config(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.is_valid_competition_age_reference_config(text, jsonb)
  to authenticated, service_role;

comment on function public.is_valid_competition_age_reference_config(text, jsonb) is
  'Valida configuración etaria con funciones disponibles en PostgreSQL 17.';

commit;
