begin;

do $$
begin
  if to_regprocedure('public.get_competition_series_ranking(uuid,uuid)') is null then
    raise exception 'FAIL | falta get_competition_series_ranking';
  end if;
  if exists (
    select 1 from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'get_competition_series_ranking'
      and not proc.prosecdef
  ) then
    raise exception 'FAIL | la lectura de ranking debe conservar su autorización server-side';
  end if;
end $$;

-- Ejecutar con un JWT autenticado de un miembro con competition:view y un
-- circuito que ya tenga settlement PUBLISHED. La consulta no crea ni modifica
-- recursos; el rollback deja explícito el contrato de la QA.
rollback;
