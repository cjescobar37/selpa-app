begin;

-- Preserve the audited extractor and layer deterministic playoff tiers on top.
alter function public.extract_competition_event_homologation_results(uuid,uuid,integer,text)
  rename to extract_competition_event_homologation_results_base_20260802;

create function public.extract_competition_event_homologation_results(p_club_id uuid,p_homologation_id uuid,p_revision integer,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare response jsonb; h public.competition_event_homologations%rowtype; playable_final_count integer;
begin
  response:=public.extract_competition_event_homologation_results_base_20260802(p_club_id,p_homologation_id,p_revision,p_idempotency_key);
  select * into h from public.competition_event_homologations where id=p_homologation_id and club_id=p_club_id;
  if not found or h.status<>'DRAFT' then return response; end if;

  select count(*) into playable_final_count
  from public.tournament_matches m
  where m.tournament_id=h.tournament_id
    and m.phase='FINAL' and m.status='PLAYED' and m.winner_team_id in(m.team1_id,m.team2_id);
  if playable_final_count > 1 then
    raise exception 'FINAL_AMBIGUOUS: tournament % has % played finals', h.tournament_id, playable_final_count;
  end if;

  perform set_config('selpa.competition_homologation_write','allowed',true);

  -- A tier exists only when the Engine recorded a played playoff match with a
  -- canonical winner. This keeps byes from becoming competitive results.
  update public.competition_event_homologation_results r
  set final_position=null,
      result_role='PARTICIPANT',
      result_snapshot=r.result_snapshot || jsonb_build_object('derived_from_phase','PARTICIPANT')
  where r.homologation_id=h.id;

  update public.competition_event_homologation_results r
  set result_role='QUARTERFINALIST',
      result_snapshot=r.result_snapshot || jsonb_build_object('derived_from_match_id',m.id,'derived_from_phase','QUARTER')
  from public.tournament_matches m
  where r.homologation_id=h.id and m.tournament_id=h.tournament_id
    and m.phase='QUARTER' and m.status='PLAYED' and m.winner_team_id in(m.team1_id,m.team2_id)
    and r.tournament_team_id=case when m.winner_team_id=m.team1_id then m.team2_id else m.team1_id end;

  update public.competition_event_homologation_results r
  set result_role='SEMIFINALIST',
      result_snapshot=r.result_snapshot || jsonb_build_object('derived_from_match_id',m.id,'derived_from_phase','SEMI')
  from public.tournament_matches m
  where r.homologation_id=h.id and m.tournament_id=h.tournament_id
    and m.phase='SEMI' and m.status='PLAYED' and m.winner_team_id in(m.team1_id,m.team2_id)
    and r.tournament_team_id=case when m.winner_team_id=m.team1_id then m.team2_id else m.team1_id end;

  update public.competition_event_homologation_results r
  set final_position=case when r.tournament_team_id=m.winner_team_id then 3 else 4 end,
      result_snapshot=r.result_snapshot || jsonb_build_object('derived_from_match_id',m.id,'derived_from_phase','THIRD_PLACE')
  from public.tournament_matches m
  where r.homologation_id=h.id and m.tournament_id=h.tournament_id
    and m.phase='THIRD_PLACE' and m.status='PLAYED' and m.winner_team_id in(m.team1_id,m.team2_id)
    and r.result_role='SEMIFINALIST' and r.tournament_team_id in(m.team1_id,m.team2_id);

  update public.competition_event_homologation_results r
  set final_position=case when r.tournament_team_id=m.winner_team_id then 1 else 2 end,
      result_role=case when r.tournament_team_id=m.winner_team_id then 'CHAMPION' else 'RUNNER_UP' end,
      result_snapshot=r.result_snapshot || jsonb_build_object('derived_from_match_id',m.id,'derived_from_phase','FINAL')
  from public.tournament_matches m
  where r.homologation_id=h.id and m.tournament_id=h.tournament_id
    and m.phase='FINAL' and m.status='PLAYED' and m.winner_team_id in(m.team1_id,m.team2_id)
    and r.tournament_team_id in(m.team1_id,m.team2_id);

  update public.competition_event_homologation_participants p
  set final_position=r.final_position,
      result_role=r.result_role,
      participant_snapshot=p.participant_snapshot || jsonb_build_object('result_role',r.result_role,'final_position',r.final_position)
  from public.competition_event_homologation_results r
  where p.homologation_id=h.id and r.homologation_id=h.id and r.tournament_team_id=p.tournament_team_id;
  return response;
end $$;

grant execute on function public.extract_competition_event_homologation_results(uuid,uuid,integer,text) to authenticated,service_role;
revoke all on function public.extract_competition_event_homologation_results_base_20260802(uuid,uuid,integer,text) from public,anon,authenticated;

comment on function public.extract_competition_event_homologation_results(uuid,uuid,integer,text) is
  'Extrae tiers desde partidos PLAYED reales: FINAL, SEMI, QUARTER y PARTICIPANT; nunca convierte byes en resultados.';

commit;
