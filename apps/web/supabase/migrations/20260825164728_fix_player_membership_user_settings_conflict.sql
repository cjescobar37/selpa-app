-- The function also returns a `user_id` output column, so PostgreSQL 17 treats
-- ON CONFLICT (user_id) as ambiguous in PL/pgSQL. Keep the already-applied
-- function contract and replace only that conflict target with its canonical PK.
do $migration$
declare
  v_definition text;
  v_fixed_definition text;
begin
  select pg_get_functiondef('public.approve_player_membership_atomic(uuid)'::regprocedure)
    into v_definition;

  v_fixed_definition := replace(
    v_definition,
    'on conflict (user_id) do update',
    'on conflict on constraint user_settings_pkey do update'
  );

  if v_fixed_definition = v_definition then
    raise exception 'Expected user_settings conflict target was not found in approve_player_membership_atomic(uuid)';
  end if;

  execute v_fixed_definition;
end
$migration$;

revoke all on function public.approve_player_membership_atomic(uuid) from public, anon;
grant execute on function public.approve_player_membership_atomic(uuid) to authenticated;
