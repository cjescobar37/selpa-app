-- Run only after proving the target is an isolated, non-production Postgres.
-- In that verified session, set selpa.qa_isolated = 'confirmed' before this file.
-- All fixture writes, including synthetic auth users, are rolled back.
begin;

do $$
begin
  if coalesce(current_setting('selpa.qa_isolated', true),'') <> 'confirmed' then
    raise exception 'QA_ISOLATED_DATABASE_NOT_CONFIRMED';
  end if;
  if to_regprocedure('public.get_competition_series_pair_ranking(uuid,uuid)') is null
     or to_regclass('public.competition_series_final_pair_rankings') is null
     or to_regprocedure('public.finalize_competition_series_atomic(uuid,uuid,integer)') is null
     or to_regprocedure('public.guard_closed_competition_series_ledger_insert()') is null then
    raise exception 'QA_MIGRATIONS_NOT_APPLIED';
  end if;
end $$;

create or replace function pg_temp.run_competition_series_pairs_qa(p_reversal boolean)
returns table(result text) language plpgsql as $$
<<qa>>
declare
  owner_id uuid:=gen_random_uuid();
  players uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  player_records uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  entries uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  club_id uuid:=gen_random_uuid(); season_id uuid:=gen_random_uuid(); branch_id uuid:=gen_random_uuid();
  category_id uuid:=gen_random_uuid(); pair_division uuid:=gen_random_uuid(); ranking_division uuid:=gen_random_uuid();
  series_id uuid:=gen_random_uuid(); other_series uuid:=gen_random_uuid();
  series_division uuid:=gen_random_uuid(); other_series_division uuid:=gen_random_uuid();
  individual_series_division uuid:=gen_random_uuid();
  rule_id uuid:=gen_random_uuid(); other_rule uuid:=gen_random_uuid(); individual_rule uuid:=gen_random_uuid();
  scheme_id uuid:=gen_random_uuid(); tier_id uuid:=gen_random_uuid();
  events uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  event_divisions uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  tournaments uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  homologations uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  settlements uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  individual_events uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  individual_event_divisions uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  individual_tournaments uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  individual_homologations uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  individual_settlements uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  team_id uuid; participant_id uuid; award_id uuid; original_id uuid; reversed_id uuid;
  correction_id uuid:=gen_random_uuid(); ledger_row record; old_award record;
  snapshot jsonb; response jsonb; pair_rows integer; i integer; j integer; k integer; idx integer;
  position_value integer; points_value integer; base_value integer; bonus_value integer;
  penalty_value integer; multiplier_value integer; category_small smallint; failed boolean;
  token text:=replace(gen_random_uuid()::text,'-','');
begin
  -- This synthetic fixture deliberately never selects a real club, user or event.
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(owner_id,'authenticated','authenticated','qa.pairs.owner.'||token||'@example.invalid',now(),'{}','{}',now(),now());
  for i in 1..6 loop
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values(players[i],'authenticated','authenticated','qa.pairs.player.'||i||'.'||token||'@example.invalid',now(),'{}','{}',now(),now());
  end loop;
  insert into public.profiles(user_id,id,email,display_name)
  select u.id,u.id,u.email,'QA pair '||left(u.id::text,8) from auth.users u
  where u.id=owner_id or u.id=any(players) on conflict do nothing;
  insert into public.clubs(id,name,slug,is_active,status,owner_user_id,approved_at,approved_by)
  values(club_id,'QA Circuit Pairs '||token,'qa-circuit-pairs-'||token,true,'ACTIVE',owner_id,now(),owner_id);
  insert into public.club_memberships(club_id,user_id,role,status,approved_by,approved_at)
  values(club_id,owner_id,'OWNER','APPROVED',owner_id,now());
  insert into public.competition_seasons(id,club_id,name,starts_on,ends_on,status,created_by)
  values(season_id,club_id,'QA 2027','2027-01-01','2027-12-31','ACTIVE',owner_id);
  insert into public.competition_branches(id,club_id,name,slug) values(branch_id,club_id,'QA Libre','qa-libre-'||token);
  insert into public.competition_categories(id,club_id,name,short_label,slug)
  values(category_id,club_id,'QA Open','QA','qa-open-'||token);
  insert into public.competition_divisions(id,club_id,season_id,modality,branch_id,category_id)
  values(pair_division,club_id,season_id,'PAIRS',branch_id,category_id),
    (ranking_division,club_id,season_id,'INDIVIDUAL',branch_id,category_id);
  insert into public.points_schemes(id,club_id,name,is_global,is_active,created_by)
  values(scheme_id,club_id,'QA Pairs',false,true,owner_id);
  insert into public.points_scheme_rules(scheme_id,rule_key,points,created_by)
  values(scheme_id,'CHAMPION',500,owner_id),(scheme_id,'RUNNER_UP',400,owner_id),
    (scheme_id,'SEMIFINALIST',200,owner_id),(scheme_id,'PARTICIPANT',50,owner_id);
  insert into public.competition_event_tiers(id,club_id,name,code,default_points_scheme_id,points_multiplier,is_active,created_by)
  values(tier_id,club_id,'QA Tier','QA-'||token,scheme_id,1,true,owner_id);
  perform set_config('selpa.competition_series_write','allowed',true);
  insert into public.competition_series(id,club_id,season_id,name,status,planned_events_count,created_by,activated_by,activated_at)
  values(series_id,club_id,season_id,'QA Pair Circuit','ACTIVE',2,owner_id,owner_id,now()),
    (other_series,club_id,season_id,'QA Other Circuit','ACTIVE',0,owner_id,owner_id,now());
  snapshot:=jsonb_build_object('division_id',pair_division,'division_name','QA Pair Division','modality','PAIRS',
    'branch_id',branch_id,'branch_name','QA Libre','segment_id',null,'segment_name',null,
    'category_id',category_id,'category_name','QA Open','season_id',season_id,'season_name','QA 2027');
  insert into public.competition_series_divisions(id,club_id,series_id,division_id,ranking_division_id,division_snapshot,frozen_at,created_by)
  values(series_division,club_id,series_id,pair_division,ranking_division,snapshot,now(),owner_id),
    (other_series_division,club_id,other_series,pair_division,ranking_division,snapshot,now(),owner_id),
    (individual_series_division,club_id,other_series,ranking_division,ranking_division,
      snapshot||jsonb_build_object('division_id',ranking_division,'division_name','QA Individual Division',
        'modality','INDIVIDUAL'),now(),owner_id);
  insert into public.competition_series_rules(id,club_id,series_division_id,version,status,points_scheme_id,frozen_at,created_by)
  values(rule_id,club_id,series_division,1,'ACTIVE',scheme_id,now(),owner_id),
    (other_rule,club_id,other_series_division,1,'ACTIVE',scheme_id,now(),owner_id),
    (individual_rule,club_id,individual_series_division,1,'ACTIVE',scheme_id,now(),owner_id);
  for i in 1..6 loop
    insert into public.club_players(id,club_id,user_id,display_name,category,gender,approved_at,approved_by)
    values(player_records[i],club_id,players[i],'QA Player '||i,6,'M',now(),owner_id);
    insert into public.competition_player_entries(id,club_id,division_id,club_player_id,status,valid_from,assigned_by)
    values(entries[i],club_id,ranking_division,player_records[i],'ACTIVE','2027-01-01',owner_id);
  end loop;
  select candidate.id::smallint into category_small from generate_series(32000,32767) candidate(id)
  where not exists(select 1 from public.categories c where c.id=candidate.id) order by candidate.id limit 1;
  insert into public.categories(id,name) values(category_small,'QA Pairs '||token);

  for i in 1..2 loop
    perform set_config('selpa.competition_event_write','allowed',true);
    insert into public.competition_series_events(id,club_id,series_id,season_id,name,status,sequence,
      planned_starts_at,planned_ends_at,actual_starts_at,actual_ends_at,timezone,scheduled_by,scheduled_at,
      completed_by,completed_at,created_by)
    values(events[i],club_id,series_id,season_id,'QA Date '||i,'COMPLETED',i,
      make_timestamptz(2027,5,i,10,0,0,'UTC'),make_timestamptz(2027,5,i,20,0,0,'UTC'),
      make_timestamptz(2027,5,i,10,0,0,'UTC'),make_timestamptz(2027,5,i,20,0,0,'UTC'),
      'America/Argentina/Buenos_Aires',owner_id,now(),owner_id,now(),owner_id);
    insert into public.competition_series_event_divisions(id,club_id,event_id,series_division_id,series_rule_id,
      event_tier_id,scoring_mode,points_scheme_override_id,points_multiplier_override,status,configuration_snapshot,
      frozen_at,completed_by,completed_at,created_by)
    values(event_divisions[i],club_id,events[i],series_division,rule_id,tier_id,'POINTS',scheme_id,
      case when i=2 then 2 else 1 end,'COMPLETED',
      jsonb_build_object('rule_id',rule_id,'rule_version',1,'tier_id',tier_id,'effective_points_scheme_id',scheme_id,
        'effective_multiplier',case when i=2 then 2 else 1 end,'scoring_mode','POINTS','ranking_division_id',ranking_division,
        'division',jsonb_build_object('division_id',pair_division,'season_id',season_id),'frozen_at',now()),
      now(),owner_id,now(),owner_id);
    insert into public.tournaments(id,club_id,name,type,start_date,end_date,status,category_id,category,
      category_rule,fixed_category_id,gender,tournament_type)
    values(tournaments[i],club_id,'QA Date '||i,'OPEN',make_date(2027,5,i),make_date(2027,5,i),
      'FINISHED',category_small,6,'FIXED_CATEGORY',category_small,'MIXED','OPEN');
    insert into public.competition_series_event_tournament_links(club_id,event_division_id,tournament_id,status,linked_by)
    values(club_id,event_divisions[i],tournaments[i],'ACTIVE',owner_id);
    perform set_config('selpa.competition_homologation_write','allowed',true);
    insert into public.competition_event_homologations(id,club_id,event_id,event_division_id,tournament_id,
      version,revision,status,result_snapshot,eligibility_snapshot,tournament_snapshot,
      submitted_by,submitted_at,approved_by,approved_at,created_by)
    values(homologations[i],club_id,events[i],event_divisions[i],tournaments[i],1,1,'APPROVED',
      '{}'::jsonb,jsonb_build_object('ranking_division_id',ranking_division,'eligibility_at',make_timestamptz(2027,5,i,10,0,0,'UTC')),
      jsonb_build_object('tournament_id',tournaments[i]),owner_id,now(),owner_id,now(),owner_id);
    insert into public.competition_event_settlements(id,club_id,event_id,event_division_id,homologation_id,
      homologation_revision,version,revision,status,scoring_mode,series_rule_id,points_scheme_id,
      effective_multiplier,calculation_snapshot,calculated_by,calculated_at,submitted_by,submitted_at,
      approved_by,approved_at,published_by,published_at,created_by)
    values(settlements[i],club_id,events[i],event_divisions[i],homologations[i],1,1,5,'PUBLISHED','POINTS',
      rule_id,scheme_id,case when i=2 then 2 else 1 end,'{}'::jsonb,
      owner_id,now(),owner_id,now(),owner_id,now(),owner_id,now(),owner_id);
    for j in 1..2 loop
      team_id:=gen_random_uuid();
      if j=1 and i=2 then
        insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)
        values(team_id,tournaments[i],club_id,players[2],players[1],owner_id);
      else
        insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)
        values(team_id,tournaments[i],club_id,players[2*j-1],players[2*j],owner_id);
      end if;
      position_value:=case when i=j then 1 else 2 end;
      points_value:=case when position_value=1 then 500 else 400 end;
      multiplier_value:=case when i=2 then 2 else 1 end;
      bonus_value:=case when i=2 and position_value=1 then 50 else 0 end;
      penalty_value:=case when i=2 and position_value=2 then -50 else 0 end;
      base_value:=case when i=2 and position_value=1 then 200
        when i=2 then 250 else points_value end;
      insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,
        final_position,result_role,result_snapshot)
      values(club_id,homologations[i],team_id,position_value,
        case when position_value=1 then 'CHAMPION' else 'RUNNER_UP' end,'{}'::jsonb);
      for k in 1..2 loop
        idx:=2*j-2+k;
        participant_id:=gen_random_uuid(); award_id:=gen_random_uuid();
        insert into public.competition_event_homologation_participants(id,club_id,homologation_id,player_id,
          club_player_id,competition_player_entry_id,tournament_team_id,participation_status,
          scoring_eligibility_status,final_position,result_role,participant_snapshot)
        values(participant_id,club_id,homologations[i],players[idx],player_records[idx],entries[idx],team_id,
          'FINISHED','ELIGIBLE',position_value,
          case when position_value=1 then 'CHAMPION' else 'RUNNER_UP' end,
          jsonb_build_object('player_id',players[idx],'eligibility_at',make_timestamptz(2027,5,i,10,0,0,'UTC')));
        insert into public.competition_event_settlement_awards(id,club_id,settlement_id,player_id,
          club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,
          base_points,multiplier,bonus_points,penalty_points,total_points,scoring_eligibility_status,calculation_detail)
        values(award_id,club_id,settlements[i],players[idx],player_records[idx],entries[idx],participant_id,
          position_value,case when position_value=1 then 'CHAMPION' else 'RUNNER_UP' end,
          base_value,multiplier_value,bonus_value,penalty_value,points_value,'ELIGIBLE',
          jsonb_build_object('eligibility_at',make_timestamptz(2027,5,i,10,0,0,'UTC')));
        perform set_config('selpa.competition_points_write','allowed',true);
        insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
          club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
          effective_at,rule_snapshot,metadata,created_by)
        values(club_id,season_id,ranking_division,entries[idx],player_records[idx],
          'TOURNAMENT_RESULT','TOURNAMENT',tournaments[i],'COMPETITION_EVENT_SETTLEMENT',
          'qa-pairs-'||token||'-'||i||'-'||j||'-'||k,points_value,
          make_timestamptz(2027,5,i,20,0,0,'UTC'),'{}'::jsonb,
          jsonb_build_object('settlement_id',settlements[i],'award_id',award_id,'eligibility_at',
            make_timestamptz(2027,5,i,10,0,0,'UTC'),'pairs_division_id',pair_division),owner_id);
      end loop;
    end loop;
    if i=1 then
      -- A participation tier has no invented ordinal final_position.
      team_id:=gen_random_uuid();
      insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)
      values(team_id,tournaments[i],club_id,players[5],players[6],owner_id);
      insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,
        final_position,result_role,result_snapshot)
      values(club_id,homologations[i],team_id,null,'PARTICIPANT','{}'::jsonb);
      for k in 5..6 loop
        participant_id:=gen_random_uuid(); award_id:=gen_random_uuid();
        insert into public.competition_event_homologation_participants(id,club_id,homologation_id,player_id,
          club_player_id,competition_player_entry_id,tournament_team_id,participation_status,
          scoring_eligibility_status,final_position,result_role,participant_snapshot)
        values(participant_id,club_id,homologations[i],players[k],player_records[k],entries[k],team_id,
          'PARTICIPATED','ELIGIBLE',null,'PARTICIPANT',
          jsonb_build_object('player_id',players[k],'eligibility_at',make_timestamptz(2027,5,i,10,0,0,'UTC')));
        insert into public.competition_event_settlement_awards(id,club_id,settlement_id,player_id,
          club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,
          base_points,multiplier,total_points,scoring_eligibility_status,calculation_detail)
        values(award_id,club_id,settlements[i],players[k],player_records[k],entries[k],participant_id,
          null,'PARTICIPANT',50,1,50,'ELIGIBLE',
          jsonb_build_object('eligibility_at',make_timestamptz(2027,5,i,10,0,0,'UTC')));
        perform set_config('selpa.competition_points_write','allowed',true);
        insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
          club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
          effective_at,rule_snapshot,metadata,created_by)
        values(club_id,season_id,ranking_division,entries[k],player_records[k],
          'TOURNAMENT_RESULT','TOURNAMENT',tournaments[i],'COMPETITION_EVENT_SETTLEMENT',
          'qa-participant-'||token||'-'||k,50,make_timestamptz(2027,5,i,20,0,0,'UTC'),'{}'::jsonb,
          jsonb_build_object('settlement_id',settlements[i],'award_id',award_id,'eligibility_at',
            make_timestamptz(2027,5,i,10,0,0,'UTC'),'pairs_division_id',pair_division),owner_id);
      end loop;
    end if;
  end loop;

  -- Independent INDIVIDUAL circuit: two real dates and three eligible players.
  -- The second team member is a synthetic non-scoring placeholder, so the
  -- ranking must contain exactly A, B and C at 700 / 900 / 600.
  for i in 1..2 loop
    perform set_config('selpa.competition_event_write','allowed',true);
    insert into public.competition_series_events(id,club_id,series_id,season_id,name,status,sequence,
      planned_starts_at,planned_ends_at,actual_starts_at,actual_ends_at,timezone,scheduled_by,scheduled_at,
      completed_by,completed_at,created_by)
    values(individual_events[i],club_id,other_series,season_id,'QA Individual Date '||i,'COMPLETED',i,
      make_timestamptz(2027,6,i,10,0,0,'UTC'),make_timestamptz(2027,6,i,20,0,0,'UTC'),
      make_timestamptz(2027,6,i,10,0,0,'UTC'),make_timestamptz(2027,6,i,20,0,0,'UTC'),
      'America/Argentina/Buenos_Aires',owner_id,now(),owner_id,now(),owner_id);
    insert into public.competition_series_event_divisions(id,club_id,event_id,series_division_id,series_rule_id,
      event_tier_id,scoring_mode,points_scheme_override_id,points_multiplier_override,status,configuration_snapshot,
      frozen_at,completed_by,completed_at,created_by)
    values(individual_event_divisions[i],club_id,individual_events[i],individual_series_division,
      individual_rule,tier_id,'POINTS',scheme_id,1,'COMPLETED',
      jsonb_build_object('rule_id',individual_rule,'rule_version',1,'tier_id',tier_id,'effective_points_scheme_id',scheme_id,
        'effective_multiplier',1,'scoring_mode','POINTS','ranking_division_id',ranking_division,
        'division',jsonb_build_object('division_id',ranking_division,'season_id',season_id),'frozen_at',now()),
      now(),owner_id,now(),owner_id);
    insert into public.tournaments(id,club_id,name,type,start_date,end_date,status,category_id,category,
      category_rule,fixed_category_id,gender,tournament_type)
    values(individual_tournaments[i],club_id,'QA Individual Date '||i,'OPEN',make_date(2027,6,i),
      make_date(2027,6,i),'FINISHED',category_small,6,'FIXED_CATEGORY',category_small,'MIXED','OPEN');
    insert into public.competition_series_event_tournament_links(club_id,event_division_id,tournament_id,status,linked_by)
    values(club_id,individual_event_divisions[i],individual_tournaments[i],'ACTIVE',owner_id);
    perform set_config('selpa.competition_homologation_write','allowed',true);
    insert into public.competition_event_homologations(id,club_id,event_id,event_division_id,tournament_id,
      version,revision,status,result_snapshot,eligibility_snapshot,tournament_snapshot,
      submitted_by,submitted_at,approved_by,approved_at,created_by)
    values(individual_homologations[i],club_id,individual_events[i],individual_event_divisions[i],
      individual_tournaments[i],1,1,'APPROVED','{}'::jsonb,
      jsonb_build_object('ranking_division_id',ranking_division,'eligibility_at',make_timestamptz(2027,6,i,10,0,0,'UTC')),
      jsonb_build_object('tournament_id',individual_tournaments[i]),owner_id,now(),owner_id,now(),owner_id);
    insert into public.competition_event_settlements(id,club_id,event_id,event_division_id,homologation_id,
      homologation_revision,version,revision,status,scoring_mode,series_rule_id,points_scheme_id,
      effective_multiplier,calculation_snapshot,calculated_by,calculated_at,submitted_by,submitted_at,
      approved_by,approved_at,published_by,published_at,created_by)
    values(individual_settlements[i],club_id,individual_events[i],individual_event_divisions[i],
      individual_homologations[i],1,1,5,'PUBLISHED','POINTS',individual_rule,scheme_id,1,
      '{}'::jsonb,owner_id,now(),owner_id,now(),owner_id,now(),owner_id,now(),owner_id);
    for j in 1..3 loop
      team_id:=gen_random_uuid(); participant_id:=gen_random_uuid(); award_id:=gen_random_uuid();
      position_value:=case when i=1 then j when j=1 then 3 when j=2 then 1 else 2 end;
      points_value:=case when position_value=1 then 500 when position_value=2 then 400 else 200 end;
      insert into public.tournament_teams(id,tournament_id,club_id,player1_user_id,player2_user_id,created_by)
      values(team_id,individual_tournaments[i],club_id,players[j],players[j+3],owner_id);
      insert into public.competition_event_homologation_results(club_id,homologation_id,tournament_team_id,
        final_position,result_role,result_snapshot)
      values(club_id,individual_homologations[i],team_id,
        case when position_value=3 then null else position_value end,
        case when position_value=1 then 'CHAMPION' when position_value=2 then 'RUNNER_UP' else 'SEMIFINALIST' end,'{}'::jsonb);
      insert into public.competition_event_homologation_participants(id,club_id,homologation_id,player_id,
        club_player_id,competition_player_entry_id,tournament_team_id,participation_status,
        scoring_eligibility_status,final_position,result_role,participant_snapshot)
      values(participant_id,club_id,individual_homologations[i],players[j],player_records[j],entries[j],team_id,
        'FINISHED','ELIGIBLE',case when position_value=3 then null else position_value end,
        case when position_value=1 then 'CHAMPION' when position_value=2 then 'RUNNER_UP' else 'SEMIFINALIST' end,
        jsonb_build_object('player_id',players[j],'eligibility_at',make_timestamptz(2027,6,i,10,0,0,'UTC')));
      insert into public.competition_event_settlement_awards(id,club_id,settlement_id,player_id,
        club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,
        base_points,multiplier,total_points,scoring_eligibility_status,calculation_detail)
      values(award_id,club_id,individual_settlements[i],players[j],player_records[j],entries[j],participant_id,
        case when position_value=3 then null else position_value end,
        case when position_value=1 then 'CHAMPION' when position_value=2 then 'RUNNER_UP' else 'SEMIFINALIST' end,
        points_value,1,points_value,'ELIGIBLE',jsonb_build_object('eligibility_at',make_timestamptz(2027,6,i,10,0,0,'UTC')));
      perform set_config('selpa.competition_points_write','allowed',true);
      insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
        club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
        effective_at,rule_snapshot,metadata,created_by)
      values(club_id,season_id,ranking_division,entries[j],player_records[j],
        'TOURNAMENT_RESULT','TOURNAMENT',individual_tournaments[i],'COMPETITION_EVENT_SETTLEMENT',
        'qa-individual-'||token||'-'||i||'-'||j,points_value,
        make_timestamptz(2027,6,i,20,0,0,'UTC'),'{}'::jsonb,
        jsonb_build_object('settlement_id',individual_settlements[i],'award_id',award_id,'eligibility_at',
          make_timestamptz(2027,6,i,10,0,0,'UTC')),owner_id);
    end loop;
  end loop;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  select count(*) into pair_rows from public.get_competition_series_pair_ranking(club_id,series_id);
  if pair_rows<>3 then raise exception 'FAIL pair count: %',pair_rows; end if;
  if exists(select 1 from public.get_competition_series_pair_ranking(club_id,series_id) r
    where r.player1_user_id>=r.player2_user_id
      or (r.player1_user_id in(least(players[1],players[2]),least(players[3],players[4]))
        and (r.points<>900 or r.events_played<>2))
      or (r.player1_user_id=least(players[5],players[6])
        and (r.points<>50 or r.events_played<>1 or r.semifinals<>0)) then
    raise exception 'FAIL pair totals, dates or canonical order';
  end if;
  if (select count(*) from public.get_competition_series_pair_ranking(club_id,other_series))<>0 then
    raise exception 'FAIL cross-series isolation';
  end if;
  if (select count(*) from public.get_competition_series_ranking_by_division(club_id,series_id)
      where series_division_id=series_division and points=900 and events_played=2)<>4 then
    raise exception 'FAIL individual multi-date accumulation';
  end if;
  if (select count(*) from public.get_competition_series_ranking_by_division(club_id,other_series)
      where series_division_id=individual_series_division)<>3
     or not exists(select 1 from public.get_competition_series_ranking_by_division(club_id,other_series) r
       where r.club_player_id=player_records[2] and r.points=900 and r.ranking_position=1 and r.events_played=2 and r.titles=1)
     or not exists(select 1 from public.get_competition_series_ranking_by_division(club_id,other_series) r
       where r.club_player_id=player_records[1] and r.points=700 and r.ranking_position=2 and r.events_played=2 and r.titles=1)
     or not exists(select 1 from public.get_competition_series_ranking_by_division(club_id,other_series) r
       where r.club_player_id=player_records[3] and r.points=600 and r.ranking_position=3
         and r.events_played=2 and r.titles=0 and r.finals=1 and r.semifinals=2) then
    raise exception 'FAIL individual 900/700/600 ranking';
  end if;
  return query select 'PASS | INDIVIDUAL: B 900 #1, A 700 #2, C 600 #3; two dates, titles, isolated series';
  return query select 'PASS | PAIRS: two dates, AB=BA, 900 each; PARTICIPANT null ordinal included; series isolation';

  if not p_reversal then
    response:=public.get_competition_series_finalization_preflight(club_id,series_id);
    if not coalesce((response->>'can_finalize')::boolean,false) then
      raise exception 'FAIL preflight: %',response->'blockers';
    end if;
    response:=public.finalize_competition_series_atomic(club_id,series_id,
      (select revision from public.competition_series where id=series_id));
    if response->>'status'<>'CLOSED' then raise exception 'FAIL close status'; end if;
    if (select count(*) from public.competition_series_final_rankings where series_id=qa.series_id)<>6
       or (select count(*) from public.competition_series_final_pair_rankings where series_id=qa.series_id)<>3 then
      raise exception 'FAIL atomic individual/pair snapshot';
    end if;
    if exists(select 1 from public.competition_series_final_pair_rankings
      where series_id=qa.series_id and (
        (player1_user_id in(least(players[1],players[2]),least(players[3],players[4]))
          and (points<>900 or events_played<>2))
        or (player1_user_id=least(players[5],players[6]) and (points<>50 or events_played<>1)))) then
      raise exception 'FAIL final pair snapshot values';
    end if;
    response:=public.finalize_competition_series_atomic(club_id,series_id,
      (select revision from public.competition_series where id=series_id));
    if not coalesce((response->>'replayed')::boolean,false)
       or (select count(*) from public.competition_series_final_pair_rankings where series_id=qa.series_id)<>3 then
      raise exception 'FAIL idempotent close';
    end if;
    failed:=false;
    begin
      update public.competition_series_final_pair_rankings set points=0
      where series_id=qa.series_id;
    exception when insufficient_privilege then failed:=true; end;
    if not failed then raise exception 'FAIL pair snapshot mutable'; end if;
    perform set_config('selpa.competition_series_write','allowed',true);
    failed:=false;
    begin
      update public.competition_series_rules set minimum_participations=1 where id=rule_id;
    exception when check_violation then failed:=true; end;
    if not failed then raise exception 'FAIL CLOSED accepted rule change'; end if;
    perform set_config('selpa.competition_homologation_write','allowed',true);
    failed:=false;
    begin
      update public.competition_event_homologation_results set matches_played=1
      where homologation_id=homologations[1];
    exception when check_violation then failed:=true; end;
    if not failed then raise exception 'FAIL CLOSED accepted homologation change'; end if;
    perform set_config('selpa.competition_settlement_write','allowed',true);
    failed:=false;
    begin
      update public.competition_event_settlements set effective_multiplier=2 where id=settlements[1];
    exception when check_violation then failed:=true; end;
    if not failed then raise exception 'FAIL CLOSED accepted settlement change'; end if;
    perform set_config('selpa.competition_event_write','allowed',true);
    failed:=false;
    begin
      insert into public.competition_series_events(club_id,series_id,season_id,name,sequence,status,created_by)
      values(club_id,series_id,season_id,'Late date',3,'DRAFT',owner_id);
    exception when check_violation then failed:=true; end;
    if not failed then raise exception 'FAIL CLOSED accepted new date'; end if;
    select tx.id into original_id from public.competition_point_transactions tx
    where tx.metadata->>'settlement_id'=settlements[1]::text
      and tx.club_player_id=player_records[1] and tx.transaction_type='TOURNAMENT_RESULT';
    perform set_config('selpa.competition_points_write','allowed',true);
    failed:=false;
    begin
      insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
        club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
        effective_at,rule_snapshot,metadata,reversed_transaction_id,created_by)
      select tx.club_id,tx.season_id,tx.division_id,tx.player_entry_id,tx.club_player_id,
        'REVERSAL',tx.source_type,tx.source_id,tx.source_concept,'qa-closed-reversal-'||token,-tx.points,
        now(),tx.rule_snapshot,'{}'::jsonb,tx.id,owner_id
      from public.competition_point_transactions tx where tx.id=original_id;
    exception when check_violation then failed:=true; end;
    if not failed then raise exception 'FAIL CLOSED accepted reversal'; end if;
    if (select count(*) from public.competition_series_final_pair_rankings where series_id=qa.series_id)<>3 then
      raise exception 'FAIL final pair snapshot changed';
    end if;
    return query select 'PASS | CLOSE: individual + pair snapshots, replay and CLOSED immutability';
    return;
  end if;

  -- Reverse one original (A on date 1); its team must disappear until its
  -- matching correction is published. This also proves historical rows remain.
  select tx.id into original_id from public.competition_point_transactions tx
  where tx.metadata->>'settlement_id'=settlements[1]::text and tx.club_player_id=player_records[1]
    and tx.transaction_type='TOURNAMENT_RESULT';
  perform set_config('selpa.competition_points_write','allowed',true);
  insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
    club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
    effective_at,rule_snapshot,metadata,reversed_transaction_id,created_by)
  select tx.club_id,tx.season_id,tx.division_id,tx.player_entry_id,tx.club_player_id,
    'REVERSAL',tx.source_type,tx.source_id,tx.source_concept,'qa-pairs-reversal-'||token,-tx.points,
    now(),tx.rule_snapshot,'{}'::jsonb,tx.id,owner_id
  from public.competition_point_transactions tx where tx.id=original_id returning id into reversed_id;
  if not exists(select 1 from public.competition_point_transactions where id=original_id)
     or not exists(select 1 from public.competition_point_transactions where id=reversed_id) then
    raise exception 'FAIL historical reversal ledger rows';
  end if;
  if (select count(*) from public.get_competition_series_pair_ranking(club_id,series_id) r
      where r.player1_user_id=least(players[1],players[2]) and r.events_played=1)<>1 then
    raise exception 'FAIL reversal did not remove one pair date';
  end if;
  return query select 'PASS | REVERSAL: original retained and one pair date removed';

  -- Simulate a full corrected publication using new immutable award/ledger rows.
  -- The first publication is superseded, never deleted. This exercises the
  -- circuit read model; the settlement command lifecycle has its own QA.
  for ledger_row in select tx.* from public.competition_point_transactions tx
    where tx.metadata->>'settlement_id'=settlements[1]::text
      and tx.transaction_type='TOURNAMENT_RESULT' and tx.id<>original_id loop
    insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
      club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
      effective_at,rule_snapshot,metadata,reversed_transaction_id,created_by)
    values(ledger_row.club_id,ledger_row.season_id,ledger_row.division_id,ledger_row.player_entry_id,
      ledger_row.club_player_id,'REVERSAL',ledger_row.source_type,ledger_row.source_id,
      ledger_row.source_concept,'qa-pairs-reversal-'||token||'-'||ledger_row.id,-ledger_row.points,
      now(),ledger_row.rule_snapshot,'{}'::jsonb,ledger_row.id,owner_id);
  end loop;
  perform set_config('selpa.competition_settlement_write','allowed',true);
  update public.competition_event_settlements set status='SUPERSEDED',published_at=null,
    superseded_at=now() where id=settlements[1];
  insert into public.competition_event_settlements(id,club_id,event_id,event_division_id,homologation_id,
    homologation_revision,version,revision,status,scoring_mode,series_rule_id,points_scheme_id,
    effective_multiplier,calculation_snapshot,calculated_by,calculated_at,submitted_by,submitted_at,
    approved_by,approved_at,published_by,published_at,corrected_from_id,created_by)
  values(correction_id,club_id,events[1],event_divisions[1],homologations[1],1,2,5,'PUBLISHED',
    'POINTS',rule_id,scheme_id,1,'{}'::jsonb,owner_id,now(),owner_id,now(),owner_id,now(),
    owner_id,now(),settlements[1],owner_id);
  update public.competition_event_settlements set superseded_by_id=correction_id where id=settlements[1];
  for old_award in select a.* from public.competition_event_settlement_awards a
    where a.settlement_id=settlements[1] loop
    award_id:=gen_random_uuid();
    points_value:=case when old_award.result_code='PARTICIPANT' then 50 else 400 end;
    insert into public.competition_event_settlement_awards(id,club_id,settlement_id,player_id,
      club_player_id,competition_player_entry_id,homologation_participant_id,final_position,result_code,
      base_points,multiplier,total_points,scoring_eligibility_status,calculation_detail)
    values(award_id,club_id,correction_id,old_award.player_id,old_award.club_player_id,
      old_award.competition_player_entry_id,old_award.homologation_participant_id,
      old_award.final_position,old_award.result_code,points_value,1,points_value,'ELIGIBLE',
      jsonb_build_object('eligibility_at',make_timestamptz(2027,5,1,10,0,0,'UTC')));
    insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
      club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
      effective_at,rule_snapshot,metadata,created_by)
    values(club_id,season_id,ranking_division,old_award.competition_player_entry_id,
      old_award.club_player_id,'TOURNAMENT_RESULT','TOURNAMENT',tournaments[1],
      'COMPETITION_EVENT_SETTLEMENT','qa-pairs-correction-'||token||'-'||old_award.id,points_value,
      make_timestamptz(2027,5,1,20,0,0,'UTC'),'{}'::jsonb,
      jsonb_build_object('settlement_id',correction_id,'award_id',award_id,'eligibility_at',
        make_timestamptz(2027,5,1,10,0,0,'UTC'),'pairs_division_id',pair_division),owner_id);
  end loop;
  if (select count(*) from public.get_competition_series_pair_ranking(club_id,series_id))<>3
     or not exists(select 1 from public.get_competition_series_pair_ranking(club_id,series_id) r
       where r.player1_user_id=least(players[1],players[2]) and r.points=800 and r.events_played=2)
     or not exists(select 1 from public.get_competition_series_pair_ranking(club_id,series_id) r
       where r.player1_user_id=least(players[3],players[4]) and r.points=900 and r.events_played=2)
     or not exists(select 1 from public.get_competition_series_pair_ranking(club_id,series_id) r
       where r.player1_user_id=least(players[5],players[6]) and r.points=50 and r.events_played=1) then
    raise exception 'FAIL corrected publication pair totals';
  end if;
  failed:=false;
  begin
    insert into public.competition_point_transactions(club_id,season_id,division_id,player_entry_id,
      club_player_id,transaction_type,source_type,source_id,source_concept,idempotency_key,points,
      effective_at,rule_snapshot,metadata,created_by)
    select tx.club_id,tx.season_id,tx.division_id,tx.player_entry_id,tx.club_player_id,
      tx.transaction_type,tx.source_type,tx.source_id,tx.source_concept,tx.idempotency_key,tx.points,
      tx.effective_at,tx.rule_snapshot,tx.metadata,tx.created_by
    from public.competition_point_transactions tx where tx.metadata->>'settlement_id'=correction_id::text limit 1;
  exception when unique_violation then failed:=true; end;
  if not failed then raise exception 'FAIL duplicate idempotency key accepted'; end if;
  return query select 'PASS | CORRECTION: old ledger retained, net 400 on date 1, AB 800, CD 900, idempotency';

end $$;

select * from pg_temp.run_competition_series_pairs_qa(true);
select * from pg_temp.run_competition_series_pairs_qa(false);
rollback;
