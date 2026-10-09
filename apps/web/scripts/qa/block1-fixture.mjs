/** Disposable, synthetic PostgreSQL fixture. Never loads .env or contacts Supabase. */
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..')
const qaRequire=createRequire(path.join(process.env.SELPA_QA_MODULES ?? path.join(root,'output/block1-qa'),'package.json'))
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export const PLAYER=id(1006), CLUB=id(1), CLUB_PLAYER=id(2006), SEASON=id(10), DIVISION=id(20)
export const QA_TOKEN=[{alg:'HS256',typ:'JWT'},{sub:PLAYER,role:'authenticated',aud:'authenticated',exp:4102444800},'QA_ONLY'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
export const QA_ACTORS=['OWNER','ADMIN','OPERADOR','PLANILLERO','PLATFORM'].map((role,index)=>{
  const userId=id(70000+index)
  const token=[{alg:'HS256',typ:'JWT'},{sub:userId,role:'authenticated',aud:'authenticated',exp:4102444800},'QA_ONLY'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.')
  return {role,userId,token}
})
export async function createFixture() {
  const {PGlite}=qaRequire('@electric-sql/pglite')
  const db=new PGlite()
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table clubs(id uuid primary key,name text,is_active boolean,owner_user_id uuid,logo_url text,theme_key text,city text,province text,country text,status text default 'ACTIVE');
    create table profiles(user_id uuid primary key,id uuid,display_name text,first_name text,last_name text,avatar_url text,cover_url text,email text,birth_date date,phone_e164 text,phone_number text,gender text,country_code text,country text,province_id text,province text,city_id text,city text,height_cm integer,dominant_hand text,preferred_position text,phone_country_code text,phone_area_code text);
    create table club_memberships(id uuid primary key,club_id uuid,user_id uuid,role text,status text,approved_at timestamptz);
    create table club_players(id uuid primary key,club_id uuid,user_id uuid,display_name text,category integer,gender text,approved_at timestamptz,ranking_points integer,preferred_position text,created_at timestamptz);
    create table platform_admins(user_id uuid);
    create table user_settings(user_id uuid primary key,active_club_id uuid);
    create table competition_seasons(id uuid primary key,club_id uuid,name text,status text);
    create table competition_branches(id uuid primary key,club_id uuid,slug text);
    create table competition_categories(id uuid primary key,club_id uuid,legacy_category_id integer,name text);
    create table competition_divisions(id uuid primary key,club_id uuid,season_id uuid,branch_id uuid,category_id uuid,modality text,segment_id uuid,is_active boolean);
    create table competition_player_entries(id uuid primary key,club_id uuid,club_player_id uuid,division_id uuid,status text,valid_until timestamptz);
    create table competition_point_transactions(id uuid primary key,club_id uuid,season_id uuid,division_id uuid,player_entry_id uuid,club_player_id uuid,points integer,reversed_transaction_id uuid,metadata jsonb,source_concept text,transaction_type text default 'TOURNAMENT_RESULT');
    create table tournaments(id uuid primary key,club_id uuid,name text,category integer,starts_on date,start_date date,status text);
    create table tournament_teams(id uuid primary key,tournament_id uuid,club_id uuid,player1_user_id uuid,player2_user_id uuid);
    create table tournament_registrations(id uuid primary key,tournament_id uuid,club_id uuid,team_id uuid,status text);
    create table tournament_matches(id uuid primary key,tournament_id uuid,club_id uuid,team1_id uuid,team2_id uuid,winner_team_id uuid,status text,score jsonb,scheduled_at timestamptz);
    create table competition_event_homologations(id uuid primary key,club_id uuid,event_id uuid,event_division_id uuid,tournament_id uuid,status text,superseded_by_id uuid,tournament_snapshot jsonb);
    create table competition_event_homologation_participants(id uuid primary key,homologation_id uuid,club_player_id uuid,player_id uuid,club_id uuid,tournament_team_id uuid,participant_snapshot jsonb,result_role text,final_position integer,scoring_eligibility_status text,participation_status text);
    create table competition_series_event_divisions(id uuid primary key,club_id uuid,series_division_id uuid);
    create table competition_series_divisions(id uuid primary key,club_id uuid,division_id uuid);
    create table competition_event_settlements(id uuid primary key,club_id uuid,homologation_id uuid,event_division_id uuid,status text);
    create table competition_event_settlement_awards(id uuid primary key,club_id uuid,player_id uuid,settlement_id uuid,homologation_participant_id uuid);
    create table player_active_partnerships(id uuid primary key,club_id uuid,player1_club_player_id uuid,player2_club_player_id uuid,status text);
  `)
  const insert=async(table,row)=>{const columns=Object.keys(row);await db.query(`insert into ${table} (${columns.join(',')}) values (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row))}
  for (const n of [1,2]) await insert('clubs',{id:id(n),name:'Club Central',is_active:true,city:'Santa Rosa',province:'La Pampa',country:'Argentina'})
  for (const [club,season,division] of [[1,10,20],[2,11,22]]) {
    await insert('competition_seasons',{id:id(season),club_id:id(club),name:'Temporada 2026',status:'ACTIVE'})
    await insert('competition_branches',{id:id(30+club),club_id:id(club),slug:'caballeros'})
    await insert('competition_categories',{id:id(40+club),club_id:id(club),legacy_category_id:6,name:'6ª categoría'})
    await insert('competition_divisions',{id:id(division),club_id:id(club),season_id:id(season),branch_id:id(30+club),category_id:id(40+club),modality:'INDIVIDUAL',is_active:true})
  }
  await insert('competition_divisions',{id:id(21),club_id:CLUB,season_id:SEASON,branch_id:id(31),category_id:id(41),modality:'PAIRS',is_active:true})
  for (let n=1;n<=60;n++) {
    const name=n===6?'Nombre quinto · apellido largo para prueba mobile':n===4||n===5?'Álex Torres':`Jugador ${n}`
    await insert('profiles',{user_id:id(1000+n),id:id(1000+n),display_name:name,first_name:name,last_name:'QA',email:`private-${n}@invalid.test`,birth_date:'1990-01-01',phone_e164:'+5491112345678',phone_number:'PRIVATE_PHONE',gender:'MALE',country_code:'AR',province_id:'42',city_id:'42021010000',country:'Argentina',city:'Santa Rosa',dominant_hand:'RIGHT',preferred_position:'DRIVE'})
    await insert('club_players',{id:id(2000+n),club_id:CLUB,user_id:id(1000+n),display_name:name,category:6,gender:'M',approved_at:'2026-01-01',ranking_points:999999})
    await insert('club_memberships',{id:id(60000+n),club_id:CLUB,user_id:id(1000+n),role:'PLAYER',status:'APPROVED',approved_at:'2026-01-01'})
    await insert('competition_player_entries',{id:id(3000+n),club_id:CLUB,club_player_id:id(2000+n),division_id:DIVISION,status:'ACTIVE'})
    await insert('competition_point_transactions',{id:id(80000+n),club_id:CLUB,season_id:SEASON,division_id:DIVISION,player_entry_id:id(3000+n),club_player_id:id(2000+n),points:10000-n*100,metadata:{},source_concept:'OPENING_BALANCE'})
  }
  // Account-wide staff exclusion and same global player in a second, same-name club.
  await insert('club_memberships',{id:id(62002),club_id:id(2),user_id:id(1002),role:'ADMIN',status:'PENDING'})
  await insert('club_memberships',{id:id(62006),club_id:id(2),user_id:PLAYER,role:'PLAYER',status:'APPROVED',approved_at:'2026-01-01'})
  await insert('club_players',{id:id(4006),club_id:id(2),user_id:PLAYER,category:6,gender:'M',approved_at:'2026-01-01',ranking_points:123456})
  await insert('competition_player_entries',{id:id(42006),club_id:id(2),club_player_id:id(4006),division_id:id(22),status:'ACTIVE'})
  await insert('competition_point_transactions',{id:id(82006),club_id:id(2),season_id:id(11),division_id:id(22),player_entry_id:id(42006),club_player_id:id(4006),points:55,metadata:{},source_concept:'OPENING_BALANCE'})
  await insert('user_settings',{user_id:PLAYER,active_club_id:CLUB})
  await insert('competition_series_divisions',{id:id(90),club_id:CLUB,division_id:DIVISION})
  await insert('competition_series_event_divisions',{id:id(91),club_id:CLUB,series_division_id:id(90)})
  await insert('player_active_partnerships',{id:id(92),club_id:CLUB,player1_club_player_id:CLUB_PLAYER,player2_club_player_id:id(2010),status:'ACTIVE'})
  for(let n=1;n<=9;n++) {
    await insert('tournaments',{id:id(5000+n),club_id:CLUB,name:`Torneo QA ${n}`,category:n===1?5:6,start_date:`2026-09-${String(n).padStart(2,'0')}`,status:n===9?'CANCELLED':'FINISHED'})
    await insert('tournament_teams',{id:id(9000+n),tournament_id:id(5000+n),club_id:CLUB,player1_user_id:PLAYER,player2_user_id:id(1010)})
    await insert('tournament_teams',{id:id(9100+n),tournament_id:id(5000+n),club_id:CLUB,player1_user_id:id(1011),player2_user_id:id(1012)})
    await insert('tournament_registrations',{id:id(12000+n),tournament_id:id(5000+n),club_id:CLUB,team_id:id(9000+n),status:n===5?'CANCELLED':'CONFIRMED'})
    if (n===5) continue
    await insert('competition_event_homologations',{id:id(6000+n),club_id:CLUB,event_id:id(13000+n),event_division_id:id(91),tournament_id:id(5000+n),status:'APPROVED',tournament_snapshot:{name:`Torneo QA ${n}`}})
    await insert('competition_event_homologation_participants',{id:id(7000+n),club_player_id:CLUB_PLAYER,player_id:PLAYER,club_id:CLUB,homologation_id:id(6000+n),tournament_team_id:id(9000+n),participant_snapshot:{display_name:'Nombre histórico'},result_role:n===1||n===6?'CHAMPION':n===2?'RUNNER_UP':n===3?'SEMIFINALIST':'PARTICIPANT',final_position:n===1||n===6?1:n===2?2:n===3?3:null,scoring_eligibility_status:n===2?'NON_SCORING':'ELIGIBLE',participation_status:'PARTICIPATED'})
    await insert('competition_event_homologation_participants',{id:id(7100+n),club_player_id:id(2010),player_id:id(1010),club_id:CLUB,homologation_id:id(6000+n),tournament_team_id:id(9000+n),participant_snapshot:{display_name:'Pareja histórica'},result_role:'PARTICIPANT',scoring_eligibility_status:'ELIGIBLE',participation_status:'PARTICIPATED'})
    await insert('tournament_matches',{id:id(10000+n),club_id:CLUB,tournament_id:id(5000+n),team1_id:id(9000+n),team2_id:n===7?null:id(9100+n),winner_team_id:n===4?null:n===2?id(9100+n):id(9000+n),status:'PLAYED',score:n===6?{walkover:true,type:'WALKOVER'}:n===7?{type:'BYE'}:n===8?{administrative:true}:{text:'6-3 6-4'},scheduled_at:`2026-09-${String(n).padStart(2,'0')}T17:00:00Z`})
  }
  // One additional played loss; only the actual winner is evidence of a loss.
  await insert('tournament_matches',{id:id(10501),club_id:CLUB,tournament_id:id(5001),team1_id:id(9001),team2_id:id(9101),winner_team_id:id(9101),status:'PLAYED',score:{text:'4-6 4-6'},scheduled_at:'2026-09-01T10:00:00Z'})
  await insert('competition_event_homologations',{id:id(6053),club_id:CLUB,event_id:id(13003),event_division_id:id(91),tournament_id:id(5003),status:'SUPERSEDED',superseded_by_id:id(6003),tournament_snapshot:{name:'Resultado anterior'}})
  await insert('competition_event_homologation_participants',{id:id(7053),club_player_id:CLUB_PLAYER,player_id:PLAYER,club_id:CLUB,homologation_id:id(6053),tournament_team_id:id(9003),participant_snapshot:{},result_role:'CHAMPION',final_position:1,scoring_eligibility_status:'ELIGIBLE',participation_status:'FINISHED'})
  await insert('competition_event_settlements',{id:id(11001),club_id:CLUB,homologation_id:id(6001),event_division_id:id(91),status:'PUBLISHED'})
  await insert('competition_event_settlement_awards',{id:id(11501),club_id:CLUB,player_id:PLAYER,settlement_id:id(11001),homologation_participant_id:id(7001)})
  await insert('competition_point_transactions',{id:id(11601),club_id:CLUB,season_id:SEASON,division_id:DIVISION,player_entry_id:id(3006),club_player_id:CLUB_PLAYER,points:50,metadata:{award_id:id(11501)},source_concept:'COMPETITION_EVENT_SETTLEMENT'})
  await insert('competition_point_transactions',{id:id(11602),club_id:CLUB,season_id:SEASON,division_id:DIVISION,player_entry_id:id(3006),club_player_id:CLUB_PLAYER,points:-50,reversed_transaction_id:id(11601),metadata:{},source_concept:'REVERSAL'})
  await insert('competition_event_settlements',{id:id(11006),club_id:CLUB,homologation_id:id(6006),event_division_id:id(91),status:'PUBLISHED'})
  for (const [award,participant,player,entry,clubPlayer] of [[11506,7006,1006,3006,2006],[11516,7106,1010,3010,2010]]) {
    await insert('competition_event_settlement_awards',{id:id(award),club_id:CLUB,player_id:id(player),settlement_id:id(11006),homologation_participant_id:id(participant)})
    await insert('competition_point_transactions',{id:id(award+100),club_id:CLUB,season_id:SEASON,division_id:DIVISION,player_entry_id:id(entry),club_player_id:id(clubPlayer),points:10,metadata:{award_id:id(award),pairs_division_id:id(21)},source_concept:'COMPETITION_EVENT_SETTLEMENT'})
  }
  const pair=await readFile(path.join(root,'apps/web/supabase/migrations/20260902120000_competition_pair_ranking_projection.sql'),'utf8')
  await db.exec(pair)
  const currentPair=await readFile(path.join(root,'apps/web/supabase/migrations/20260909120000_competition_pairs_ranking_pipeline_fix.sql'),'utf8')
  const pairStart=currentPair.indexOf('create or replace view public.competition_pair_ranking_projection')
  const pairEnd=currentPair.indexOf('revoke all on public.competition_pair_ranking_projection',pairStart)
  if (pairStart<0 || pairEnd<0) throw new Error('Canonical PAIRS fixture source not found')
  await db.exec(currentPair.slice(pairStart,pairEnd))
  const migration=await readFile(path.join(root,'apps/web/supabase/migrations/20261009100429_player_career_read_models.sql'),'utf8')
  await db.exec(migration)
  for(const [index,actor] of QA_ACTORS.entries()) {
    await insert('profiles',{user_id:actor.userId,id:actor.userId,first_name:'Cuenta',last_name:actor.role,display_name:'Cuenta '+actor.role,email:'qa-staff@invalid.test'})
    await insert('user_settings',{user_id:actor.userId,active_club_id:CLUB})
    if(actor.role==='PLATFORM') await insert('platform_admins',{user_id:actor.userId})
    else await insert('club_memberships',{id:id(71000+index),club_id:CLUB,user_id:actor.userId,role:actor.role,status:'APPROVED',approved_at:'2026-01-01'})
  }
  return db
}
