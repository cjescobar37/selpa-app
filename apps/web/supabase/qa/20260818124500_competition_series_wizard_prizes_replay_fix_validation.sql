begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(proc.oid) into v_definition
  from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'create_competition_series_with_prizes_from_wizard'
    and pg_get_function_identity_arguments(proc.oid) = 'p_club_id uuid, p_idempotency_key text, p_payload jsonb';

  if v_definition not ilike '%pg_advisory_xact_lock%'
     or v_definition not ilike '%response_payload is not null%'
     or v_definition not ilike '%if coalesce(v_completed, false)%' then
    raise exception 'FAIL | replay no está protegido como no-op';
  end if;
end;
$$;

select 'PASS | Replay serializado y no-op: no reemplaza premios ni incrementa revisión nuevamente; rollback final' as result;

rollback;
