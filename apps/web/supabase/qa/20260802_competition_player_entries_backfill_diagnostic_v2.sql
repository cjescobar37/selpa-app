-- Solo lectura. Requiere una sesión con ranking:view o platform admin.
-- Cambiar únicamente el club UUID si se diagnostica otro club.
select diagnostic.*
from public.get_competition_backfill_diagnostic(
  '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid,
  null
) diagnostic
order by diagnostic.diagnostic_status, diagnostic.player_name, diagnostic.club_player_id;

select diagnostic.diagnostic_status, count(*) as players
from public.get_competition_backfill_diagnostic(
  '7c70723b-8244-4117-9a2e-b9a129f661a9'::uuid,
  null
) diagnostic
group by diagnostic.diagnostic_status
order by diagnostic.diagnostic_status;
