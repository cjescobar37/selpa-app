-- Read-only catalog validation for PostgREST-callable settlement RPC wrappers.
do $$
declare
  function_name text;
  function_row record;
  expected_arguments text[] := array[
    'p_club_id',
    'p_settlement_id',
    'p_revision',
    'p_idempotency_key'
  ];
begin
  foreach function_name in array array[
    'submit_competition_event_settlement',
    'approve_competition_event_settlement',
    'publish_competition_event_settlement'
  ]
  loop
    select
      procedure.oid,
      procedure.proargnames::text[] as argument_names,
      procedure.prosecdef,
      procedure.proconfig,
      language.lanname as language_name,
      format_type(procedure.prorettype, null) as return_type
    into strict function_row
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_language language on language.oid = procedure.prolang
    where namespace.nspname = 'public'
      and procedure.proname = function_name
      and procedure.oid = to_regprocedure(format('public.%I(uuid,uuid,integer,text)', function_name));

    if function_row.argument_names is distinct from expected_arguments then
      raise exception '% has invalid proargnames: %', function_name, function_row.argument_names;
    end if;

    if function_row.return_type <> 'jsonb'
       or function_row.language_name <> 'sql'
       or function_row.prosecdef is not true
       or not coalesce(function_row.proconfig @> array['search_path=pg_catalog, public'], false) then
      raise exception '% does not preserve its wrapper contract', function_name;
    end if;

    if exists (
      select 1
      from aclexplode(coalesce(
        (select procedure.proacl from pg_proc procedure where procedure.oid = function_row.oid),
        acldefault('f', (select procedure.proowner from pg_proc procedure where procedure.oid = function_row.oid))
      )) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can execute %', function_name;
    end if;

    if has_function_privilege('anon', function_row.oid, 'EXECUTE') then
      raise exception 'anon can execute %', function_name;
    end if;

    if not has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
       or not has_function_privilege('service_role', function_row.oid, 'EXECUTE') then
      raise exception 'authenticated/service_role grants are missing for %', function_name;
    end if;
  end loop;
end
$$;
