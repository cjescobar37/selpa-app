begin;

create or replace function pg_temp.run_tournament_lifecycle_finalize_e2e_qa()
returns table(qa_status text, qa_detail jsonb)
language plpgsql
as $$
declare
  v_owner uuid; v_other_owner uuid; v_left_player uuid; v_club uuid; v_category int; v_gender text;
  v_players uuid[]; v_club_players uuid[]; v_teams uuid[] := array[]::uuid[];
  v_tournament uuid; v_aux uuid; v_team uuid; v_registration uuid;
  v_group_a uuid; v_group_b uuid; v_group record; v_group_teams uuid[];
  v_a uuid[]; v_b uuid[]; v_group_matches uuid[] := array[]::uuid[];
  v_match uuid; v_semi_1 uuid; v_semi_2 uuid; v_final uuid; v_extra_final uuid;
  v_champion uuid; v_champion_players uuid[]; v_failed boolean; v_order int := 1;
  v_i int; v_j int; v_expected jsonb; v_obtained jsonb;
  v_snapshot_before jsonb; v_snapshot_after jsonb; v_history_before jsonb; v_history_after jsonb;
begin
  if to_regprocedure('public.publish_tournament_atomic(uuid,uuid)') is null
     or to_regprocedure('public.finalize_tournament_atomic(uuid,uuid)') is null
     or to_regprocedure('public.create_tournament_canonical(uuid,jsonb)') is null
     or to_regprocedure('public.register_team_for_tournament(uuid,uuid,uuid)') is null then
    return query select 'FAIL', jsonb_build_object('error','Faltan primitives canónicas.'); return;
  end if;

  select cp.club_id, cp.category, upper(cp.gender)
    into v_club, v_category, v_gender
  from public.club_players cp
  join public.club_memberships cm on cm.club_id=cp.club_id and cm.user_id=cp.user_id
  where cp.user_id is not null and cp.category is not null
    and cp.operational_status::text='ACTIVE' and cm.status::text='APPROVED' and cm.role::text='PLAYER'
    and exists(select 1 from public.club_memberships a where a.club_id=cp.club_id and a.role::text in('OWNER','ADMIN') and a.status::text='APPROVED')
  group by cp.club_id,cp.category,upper(cp.gender)
  having count(distinct cp.user_id)>=18
  order by count(distinct cp.user_id) desc limit 1;
  select user_id into v_owner from public.club_memberships
    where club_id=v_club and role::text in('OWNER','ADMIN') and status::text='APPROVED'
    order by case when role::text='OWNER' then 0 else 1 end,created_at limit 1;
  select user_id into v_other_owner from public.club_memberships
    where club_id<>v_club and role::text in('OWNER','ADMIN') and status::text='APPROVED'
    order by created_at limit 1;
  select cp.user_id into v_left_player
  from public.club_players cp
  where cp.club_id=v_club and cp.user_id is not null
    and cp.operational_status::text='LEFT'
  order by cp.id
  limit 1;
  select array_agg(user_id order by user_id),array_agg(id order by user_id)
    into v_players,v_club_players
  from (select distinct cp.user_id,cp.id from public.club_players cp
    join public.club_memberships cm on cm.club_id=cp.club_id and cm.user_id=cp.user_id
    where cp.club_id=v_club and cp.category=v_category and upper(cp.gender)=v_gender
      and cp.operational_status::text='ACTIVE' and cm.status::text='APPROVED' and cm.role::text='PLAYER'
    order by cp.user_id limit 18) p;
  if v_owner is null or v_other_owner is null or coalesce(array_length(v_players,1),0)<18 then
    return query select 'BLOCKED',jsonb_build_object('fixture','OWNER, cross-club OWNER y 18 jugadores compatibles requeridos.'); return;
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  select id into v_tournament from public.create_tournament_canonical(v_club,jsonb_build_object(
    'name','QA Tournament lifecycle E2E','type','OPEN','gender',case when v_gender in('F','FEMALE') then 'FEMALE' else 'MALE' end,
    'segment','LIBRES','category_id',v_category,'format','GROUPS_ELIMINATION',
    'start_date',(current_date+7)::text,'end_date',(current_date+8)::text,
    'registration_deadline',(now()+interval '2 days')::text,'min_pairs',2,'max_pairs',8,'price_per_player',0,
    'classification_rules',jsonb_build_object('classify_per_group',2,'points_for_win',3,'points_for_loss',0)
  ));
  perform public.publish_tournament_atomic(v_club,v_tournament); reset role;
  if (select status from public.tournaments where id=v_tournament)<>'OPEN' then raise exception 'DRAFT_OPEN_FAILED'; end if;

  for v_i in 1..8 loop
    perform set_config('request.jwt.claim.sub',v_players[v_i*2-1]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
    select r.team_id,r.registration_id into v_team,v_registration
      from public.register_team_for_tournament(v_tournament,v_club,v_players[v_i*2]) r;
    reset role;
    if v_team is null or v_registration is null then raise exception 'REGISTRATION_FAILED'; end if;
    v_teams:=array_append(v_teams,v_team);
  end loop;
  if (select count(*) from public.tournament_teams where tournament_id=v_tournament)<>8
     or (select count(*) from public.tournament_registrations where tournament_id=v_tournament)<>8 then raise exception 'REGISTRATION_COUNTS_INVALID'; end if;

  -- BLOCKED/BANNED and LEFT integration; transaction rollback restores both players.
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.block_club_player_atomic(v_club,v_club_players[17],'QA Tournament integration'); reset role;
  if (select operational_status::text from public.club_players where id=v_club_players[17])<>'BLOCKED'
     or (select status::text from public.club_memberships where club_id=v_club and user_id=v_players[17])<>'BANNED' then raise exception 'BLOCKED_BANNED_INVALID'; end if;
  perform set_config('request.jwt.claim.sub',v_players[17]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.register_team_for_tournament(v_tournament,v_club,v_players[18]); exception when others then if sqlerrm='CLUB_PLAYER_NOT_ELIGIBLE' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'BLOCKED_REGISTERED'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.reactivate_club_player_atomic(v_club,v_club_players[17]); reset role;
  if v_left_player is not null then
    perform set_config('request.jwt.claim.sub',v_left_player::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
    v_failed:=false; begin perform public.register_team_for_tournament(v_tournament,v_club,v_players[17]); exception when others then if sqlerrm='CLUB_PLAYER_NOT_ELIGIBLE' then v_failed:=true; else raise; end if; end; reset role;
    if not v_failed then raise exception 'LEFT_REGISTERED'; end if;
  end if;

  insert into public.tournament_groups(tournament_id,name,size,"order") values(v_tournament,'A',4,1) returning id into v_group_a;
  insert into public.tournament_groups(tournament_id,name,size,"order") values(v_tournament,'B',4,2) returning id into v_group_b;
  insert into public.tournament_group_teams(tournament_id,group_id,team_id,seed) values
    (v_tournament,v_group_a,v_teams[1],1),(v_tournament,v_group_a,v_teams[4],4),(v_tournament,v_group_a,v_teams[5],5),(v_tournament,v_group_a,v_teams[8],8),
    (v_tournament,v_group_b,v_teams[2],2),(v_tournament,v_group_b,v_teams[3],3),(v_tournament,v_group_b,v_teams[6],6),(v_tournament,v_group_b,v_teams[7],7);
  v_a:=array[v_teams[1],v_teams[4],v_teams[5],v_teams[8]]; v_b:=array[v_teams[2],v_teams[3],v_teams[6],v_teams[7]];

  for v_group in select id from public.tournament_groups where tournament_id=v_tournament order by "order" loop
    select array_agg(team_id order by seed) into v_group_teams from public.tournament_group_teams where group_id=v_group.id;
    for v_i in 1..3 loop for v_j in v_i+1..4 loop
      insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,phase,status,score,round,match_order)
      values(v_tournament,v_club,v_group.id,v_group_teams[v_i],v_group_teams[v_j],'GROUP','PENDING','{}',1,v_order) returning id into v_match;
      v_group_matches:=array_append(v_group_matches,v_match); v_order:=v_order+1;
    end loop; end loop;
  end loop;

  v_failed:=false; begin
    insert into public.tournament_matches(tournament_id,club_id,group_id,team1_id,team2_id,phase,status,score,round,match_order)
    select tournament_id,club_id,group_id,team1_id,team2_id,phase,'PENDING','{}',round,match_order from public.tournament_matches where id=v_group_matches[1];
  exception when unique_violation then v_failed:=true; end;
  if not v_failed or (select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='GROUP')<>12 then raise exception 'FIXTURE_DUPLICATE_PROTECTION_FAILED'; end if;

  update public.tournament_matches set status='PLAYED',score='{"sets":[{"team1":6,"team2":0},{"team1":6,"team2":0}]}'::jsonb,winner_team_id=team1_id where id=v_group_matches[1];
  if (select status from public.tournaments where id=v_tournament)<>'RUNNING' then raise exception 'OPEN_RUNNING_FAILED'; end if;
  update public.tournament_matches set status='PLAYED',score='{"sets":[{"team1":6,"team2":0},{"team1":6,"team2":0}]}'::jsonb,winner_team_id=team1_id
    where id=any(v_group_matches) and id<>v_group_matches[1];

  create temporary table pg_temp.qa_standings on commit drop as
  with side_rows as (
    select m.group_id,m.id match_id,m.team1_id team_id,(m.winner_team_id=m.team1_id)::int won,2 sf,0 sa,12 gf,0 ga from public.tournament_matches m where m.tournament_id=v_tournament and m.phase::text='GROUP' and m.status::text='PLAYED'
    union all select m.group_id,m.id,m.team2_id,(m.winner_team_id=m.team2_id)::int,0,2,0,12 from public.tournament_matches m where m.tournament_id=v_tournament and m.phase::text='GROUP' and m.status::text='PLAYED'
  ), agg as (
    select gt.group_id,gt.team_id,gt.seed,count(s.match_id)::int played,sum(s.won)::int wins,(count(s.match_id)-sum(s.won))::int losses,(sum(s.won)*3)::int points,
      sum(s.sf)::int sets_for,sum(s.sa)::int sets_against,(sum(s.sf)-sum(s.sa))::int set_diff,sum(s.gf)::int games_for,sum(s.ga)::int games_against,(sum(s.gf)-sum(s.ga))::int game_diff
    from public.tournament_group_teams gt join side_rows s on s.group_id=gt.group_id and s.team_id=gt.team_id where gt.tournament_id=v_tournament group by gt.group_id,gt.team_id,gt.seed
  ) select *,row_number() over(partition by group_id order by points desc,set_diff desc,game_diff desc,seed,team_id)::int position from agg;
  if exists(select 1 from pg_temp.qa_standings where played<>3 or wins<>4-position or losses<>position-1 or points<>(4-position)*3 or set_diff<>((4-position)*2-(position-1)*2) or game_diff<>((4-position)*12-(position-1)*12)) then raise exception 'STANDINGS_MATH_MISMATCH'; end if;
  if (select array_agg(team_id order by position) from pg_temp.qa_standings where group_id=v_group_a)<>v_a or (select array_agg(team_id order by position) from pg_temp.qa_standings where group_id=v_group_b)<>v_b then raise exception 'STANDINGS_ORDER_MISMATCH'; end if;
  select jsonb_agg(jsonb_build_object('group',g.name,'team',s.team_id,'position',s.position,'pj',s.played,'wins',s.wins,'losses',s.losses,'points',s.points,'sets',jsonb_build_array(s.sets_for,s.sets_against),'games',jsonb_build_array(s.games_for,s.games_against)) order by g."order",s.position)
    into v_obtained from pg_temp.qa_standings s join public.tournament_groups g on g.id=s.group_id;
  v_expected:=jsonb_build_object('per_group',jsonb_build_array(
    jsonb_build_object('position',1,'pj',3,'wins',3,'losses',0,'points',9,'set_diff',6,'game_diff',36),
    jsonb_build_object('position',2,'pj',3,'wins',2,'losses',1,'points',6,'set_diff',2,'game_diff',12),
    jsonb_build_object('position',3,'pj',3,'wins',1,'losses',2,'points',3,'set_diff',-2,'game_diff',-12),
    jsonb_build_object('position',4,'pj',3,'wins',0,'losses',3,'points',0,'set_diff',-6,'game_diff',-36)));

  insert into public.tournament_matches(tournament_id,club_id,team1_id,team2_id,phase,status,score,round,match_order) values(v_tournament,v_club,v_a[1],v_b[2],'SEMI','PENDING','{}',1,1) returning id into v_semi_1;
  insert into public.tournament_matches(tournament_id,club_id,team1_id,team2_id,phase,status,score,round,match_order) values(v_tournament,v_club,v_b[1],v_a[2],'SEMI','PENDING','{}',1,2) returning id into v_semi_2;
  update public.tournament_matches set status='PLAYED',score='{"sets":[{"team1":6,"team2":2},{"team1":6,"team2":3}]}'::jsonb,winner_team_id=team1_id where id in(v_semi_1,v_semi_2);
  insert into public.tournament_matches(tournament_id,club_id,team1_id,team2_id,phase,status,score,round,match_order) values(v_tournament,v_club,v_a[1],v_b[1],'FINAL','PENDING','{}',2,1) returning id into v_final;

  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when check_violation then if sqlerrm='TOURNAMENT_MATCHES_PENDING' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'PENDING_FINAL_ACCEPTED'; end if;
  update public.tournament_matches set status='PLAYED',score='{"sets":[{"team1":6,"team2":4},{"team1":6,"team2":4}]}'::jsonb,winner_team_id=null where id=v_final;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when check_violation then if sqlerrm='TOURNAMENT_FINAL_RESULT_REQUIRED' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'WINNERLESS_FINAL_ACCEPTED'; end if;
  v_failed:=false;
  begin
    update public.tournament_matches set winner_team_id=v_a[2] where id=v_final;
  exception when others then
    if sqlerrm='El ganador debe ser uno de los equipos del partido' then v_failed:=true; else raise; end if;
  end;
  if not v_failed then
    perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
    begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when check_violation then if sqlerrm='TOURNAMENT_FINAL_WINNER_INVALID' then v_failed:=true; else raise; end if; end; reset role;
  end if;
  if not v_failed then raise exception 'INVALID_WINNER_ACCEPTED'; end if;
  update public.tournament_matches set winner_team_id=team1_id where id=v_final;

  insert into public.tournament_matches(tournament_id,club_id,team1_id,team2_id,phase,status,score,winner_team_id,round,match_order)
    values(v_tournament,v_club,v_a[1],v_b[1],'FINAL','PLAYED','{"sets":[{"team1":6,"team2":1},{"team1":6,"team2":1}]}',v_a[1],2,2) returning id into v_extra_final;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when check_violation then if sqlerrm='TOURNAMENT_FINAL_REQUIRED' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'MULTIPLE_FINALS_ACCEPTED'; end if; delete from public.tournament_matches where id=v_extra_final;

  perform set_config('request.jwt.claim.sub',v_players[1]::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when insufficient_privilege then if sqlerrm='TOURNAMENT_FORBIDDEN' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'PLAYER_FINALIZED'; end if;
  perform set_config('request.jwt.claim.sub',v_other_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_tournament); exception when insufficient_privilege then if sqlerrm='TOURNAMENT_FORBIDDEN' then v_failed:=true; else raise; end if; end; reset role;
  if not v_failed then raise exception 'CROSS_CLUB_FINALIZED'; end if;

  select winner_team_id into v_champion from public.tournament_matches where id=v_final;
  select array[player1_user_id,player2_user_id] into v_champion_players from public.tournament_teams where id=v_champion;
  select jsonb_build_object('teams',(select count(*) from public.tournament_teams where tournament_id=v_tournament),'registrations',(select count(*) from public.tournament_registrations where tournament_id=v_tournament),'groups',(select count(*) from public.tournament_groups where tournament_id=v_tournament),'group_members',(select count(*) from public.tournament_group_teams where tournament_id=v_tournament),'group_matches',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='GROUP'),'semifinals',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='SEMI'),'finals',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='FINAL')) into v_history_before;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  perform public.finalize_tournament_atomic(v_club,v_tournament); select coalesce(rules_json,rules,'{}')->'tournament_finalization' into v_snapshot_before from public.tournaments where id=v_tournament;
  perform public.finalize_tournament_atomic(v_club,v_tournament); reset role;
  select coalesce(rules_json,rules,'{}')->'tournament_finalization' into v_snapshot_after from public.tournaments where id=v_tournament;
  select jsonb_build_object('teams',(select count(*) from public.tournament_teams where tournament_id=v_tournament),'registrations',(select count(*) from public.tournament_registrations where tournament_id=v_tournament),'groups',(select count(*) from public.tournament_groups where tournament_id=v_tournament),'group_members',(select count(*) from public.tournament_group_teams where tournament_id=v_tournament),'group_matches',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='GROUP'),'semifinals',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='SEMI'),'finals',(select count(*) from public.tournament_matches where tournament_id=v_tournament and phase::text='FINAL')) into v_history_after;
  if (select status from public.tournaments where id=v_tournament)<>'FINISHED' or v_snapshot_before->>'champion_team_id'<>v_champion::text or v_snapshot_before<>v_snapshot_after or v_history_before<>v_history_after then raise exception 'FINALIZE_REPLAY_HISTORY_FAILED'; end if;

  -- No-final, CANCELLED, and invalid publish protections.
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;
  select id into v_aux from public.create_tournament_canonical(v_club,jsonb_build_object('name','QA no final','type','OPEN','gender',case when v_gender in('F','FEMALE') then 'FEMALE' else 'MALE' end,'segment','LIBRES','category_id',v_category,'start_date',(current_date+7)::text,'end_date',(current_date+8)::text,'registration_deadline',(now()+interval '2 days')::text,'min_pairs',2,'max_pairs',8,'price_per_player',0)); perform public.publish_tournament_atomic(v_club,v_aux);
  v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_aux); exception when check_violation then if sqlerrm='TOURNAMENT_FINAL_REQUIRED' then v_failed:=true; else raise; end if; end; if not v_failed then raise exception 'NO_FINAL_FINISHED'; end if;
  select id into v_aux from public.create_tournament_canonical(v_club,jsonb_build_object('name','QA cancelled','type','OPEN','gender',case when v_gender in('F','FEMALE') then 'FEMALE' else 'MALE' end,'segment','LIBRES','category_id',v_category,'start_date',(current_date+7)::text,'end_date',(current_date+8)::text,'registration_deadline',(now()+interval '2 days')::text,'min_pairs',2,'max_pairs',8,'price_per_player',0)); reset role; update public.tournaments set status='CANCELLED' where id=v_aux;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated; v_failed:=false; begin perform public.finalize_tournament_atomic(v_club,v_aux); exception when check_violation then if sqlerrm='INVALID_STATUS_TRANSITION' then v_failed:=true; else raise; end if; end; if not v_failed then raise exception 'CANCELLED_FINISHED'; end if;
  select id into v_aux from public.create_tournament_canonical(v_club,jsonb_build_object('name','QA invalid publish','type','OPEN','gender',case when v_gender in('F','FEMALE') then 'FEMALE' else 'MALE' end,'segment','LIBRES','category_id',v_category,'start_date',(current_date+7)::text,'end_date',(current_date+8)::text,'registration_deadline',(now()+interval '2 days')::text,'min_pairs',2,'max_pairs',8,'price_per_player',0)); reset role; update public.tournaments set name='' where id=v_aux;
  perform set_config('request.jwt.claim.sub',v_owner::text,true); perform set_config('request.jwt.claim.role','authenticated',true); set local role authenticated; v_failed:=false; begin perform public.publish_tournament_atomic(v_club,v_aux); exception when check_violation then if sqlerrm='TOURNAMENT_NAME_REQUIRED' then v_failed:=true; else raise; end if; end; reset role; if not v_failed then raise exception 'INVALID_DRAFT_PUBLISHED'; end if;

  if exists(select 1 from public.competition_series_event_tournament_links where tournament_id=v_tournament) then raise exception 'UNEXPECTED_COMPETITION_SIDE_EFFECT'; end if;
  return query select 'PASS',jsonb_build_object(
    'fixture',jsonb_build_object('teams',8,'registrations',8,'groups',2,'group_matches',12,'semifinals',2,'finals',1),
    'standings_expected',v_expected,'standings_obtained',v_obtained,
    'qualifiers',jsonb_build_object('A',jsonb_build_array(v_a[1],v_a[2]),'B',jsonb_build_array(v_b[1],v_b[2])),
    'semifinals',jsonb_build_array(jsonb_build_array(v_a[1],v_b[2]),jsonb_build_array(v_b[1],v_a[2])),
    'final',jsonb_build_array(v_a[1],v_b[1]),'champion_team_id',v_champion,'champion_players',v_champion_players,
    'history_before',v_history_before,'history_after',v_history_after,'finalize_replay_same_snapshot',v_snapshot_before=v_snapshot_after,
    'player_lifecycle',case when v_left_player is null then 'ACTIVE allowed; BLOCKED/BANNED rejected; LEFT blocked by missing real fixture' else 'ACTIVE allowed; BLOCKED/BANNED and LEFT rejected' end,
    'left_fixture_available',v_left_player is not null,'competition_side_effects',0,'rollback',true);
exception when others then reset role; return query select 'FAIL',jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate);
end $$;

select qa_status,qa_detail from pg_temp.run_tournament_lifecycle_finalize_e2e_qa();
rollback;
