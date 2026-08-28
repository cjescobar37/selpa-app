begin;

-- The function body and contract are already canonical. Re-declare its explicit
-- runtime configuration so PostgREST receives a DDL event, then request an
-- immediate schema refresh. This repairs a stale API cache without changing
-- tournament lifecycle behavior or permissions.
alter function public.publish_tournament_atomic(uuid, uuid)
  set search_path = pg_catalog, public;

notify pgrst, 'reload schema';

commit;
