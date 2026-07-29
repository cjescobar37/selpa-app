-- Rollback exacto del setup visual 20260727. Es seguro únicamente si el preflight conserva los valores QA.
begin;

do $$
begin
  if (select cp.ranking_points from public.club_players cp where cp.id = '6c56b492-b331-4579-83d9-228a45c35390') <> 2004 then
    raise exception 'Rollback detenido: el puntaje QA de B fue modificado por otro proceso';
  end if;

  delete from public.player_active_partnerships as pap
  where pap.id = '00000000-0000-4000-8000-202607270002'
    and pap.accepted_invite_id = '00000000-0000-4000-8000-202607270001';

  delete from public.player_partner_invites as ppi
  where ppi.id = '00000000-0000-4000-8000-202607270001'
    and ppi.message = 'QA Ranking empate y pareja confirmada';

  update public.club_players as cp
  set ranking_points = 2074
  where cp.id = '6c56b492-b331-4579-83d9-228a45c35390'
    and cp.club_id = '7c70723b-8244-4117-9a2e-b9a129f661a9';
end;
$$;

commit;
