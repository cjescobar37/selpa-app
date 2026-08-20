begin;

do $$
declare
  v_definition text;
  v_acl aclitem[];
begin
  select pg_get_functiondef(proc.oid), proc.proacl
    into v_definition, v_acl
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'create_competition_series_with_prizes_from_wizard'
    and pg_get_function_identity_arguments(proc.oid) = 'p_club_id uuid, p_idempotency_key text, p_payload jsonb';

  if v_definition is null then
    raise exception 'FAIL | wrapper transaccional ausente';
  end if;
  if v_definition not ilike '%create_competition_series_from_wizard%'
     or v_definition not ilike '%replace_competition_series_prizes%'
     or v_definition not ilike '%p_payload -> ''prizes''%'
     or v_definition ilike '%commit%'
     or v_definition ilike '%rollback%' then
    raise exception 'FAIL | integración de premios fuera de la transacción canónica';
  end if;
  if has_function_privilege('anon', 'public.create_competition_series_with_prizes_from_wizard(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'FAIL | anon conserva EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.create_competition_series_with_prizes_from_wizard(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'FAIL | authenticated sin EXECUTE';
  end if;
end;
$$;

select 'PASS | Alta de circuito y premios comparten transacción, idempotencia y permisos canónicos; rollback final' as result;

rollback;
