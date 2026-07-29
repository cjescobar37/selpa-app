-- SOLO DESARROLLO. Prepara el caso visual #1, #2, #2, #4 y una pareja confirmada consecutiva.
-- Ejecutar primero el bloque de preflight. Si no devuelve exactamente las filas esperadas, hacer ROLLBACK.
begin;

do $$
declare
  v_club_id constant uuid := '7c70723b-8244-4117-9a2e-b9a129f661a9';
  v_player_a constant uuid := 'dd803a32-81f9-42d8-8cc9-bb4e0fd0b850';
  v_player_b constant uuid := '6c56b492-b331-4579-83d9-228a45c35390';
  v_player_c constant uuid := '55dff5dd-8bc5-46d6-9a3d-e59aa6e163c2';
  v_invite_id constant uuid := '00000000-0000-4000-8000-202607270001';
  v_partnership_id constant uuid := '00000000-0000-4000-8000-202607270002';
begin
  if (select count(*) from public.club_players cp where cp.club_id = v_club_id and cp.id in (v_player_a, v_player_b, v_player_c)) <> 3 then
    raise exception 'QA no ejecutable: cambiaron los jugadores esperados';
  end if;
  if (select cp.ranking_points from public.club_players cp where cp.id = v_player_a) <> 2092 then
    raise exception 'QA no ejecutable: A ya no tiene 2092 puntos';
  end if;
  if (select cp.ranking_points from public.club_players cp where cp.id = v_player_b) <> 2074 then
    raise exception 'QA no ejecutable: B ya no tiene el valor original 2074';
  end if;
  if (select cp.ranking_points from public.club_players cp where cp.id = v_player_c) <> 2004 then
    raise exception 'QA no ejecutable: C ya no tiene 2004 puntos';
  end if;
  if exists (
    select 1 from public.player_active_partnerships pap
    where pap.club_id = v_club_id and pap.status = 'ACTIVE'
      and (pap.player1_club_player_id in (v_player_b, v_player_c) or pap.player2_club_player_id in (v_player_b, v_player_c))
  ) then
    raise exception 'QA no ejecutable: B o C ya tiene pareja activa';
  end if;

  update public.club_players as cp set ranking_points = 2004 where cp.id = v_player_b and cp.club_id = v_club_id;

  insert into public.player_partner_invites (
    id, club_id, sender_club_player_id, receiver_club_player_id, status, message, responded_at
  ) values (
    v_invite_id, v_club_id, v_player_b, v_player_c, 'ACCEPTED', 'QA Ranking empate y pareja confirmada', now()
  );

  insert into public.player_active_partnerships (
    id, club_id, player1_club_player_id, player2_club_player_id, status, created_by,
    accepted_invite_id, accepted_at
  ) values (
    v_partnership_id, v_club_id, least(v_player_b, v_player_c), greatest(v_player_b, v_player_c),
    'ACTIVE', null, v_invite_id, now()
  );
end;
$$;

select cp.id, cp.display_name, cp.ranking_points
from public.club_players cp
where cp.club_id = '7c70723b-8244-4117-9a2e-b9a129f661a9'
order by cp.ranking_points desc, cp.display_name
limit 4;

commit;
