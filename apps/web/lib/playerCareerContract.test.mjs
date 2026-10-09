import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createFixture,id,PLAYER,CLUB,CLUB_PLAYER,SEASON,DIVISION} from '../scripts/qa/block1-fixture.mjs'
const db=await createFixture()
test.after(()=>db.close())
const sql=readFileSync(new URL('../supabase/migrations/20261009100429_player_career_read_models.sql',import.meta.url),'utf8')
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const req=createRequire(new URL('../package.json',import.meta.url));const ts=req('typescript')
const rules=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src('../features/player-career/player-career.rules.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))
test('migration compiles in real embedded PostgreSQL; read-only invoker and grants',()=>{
  assert.match(sql,/security_invoker = true/);assert.doesNotMatch(sql,/security definer|insert into|update public|delete from|create trigger/i)
  assert.match(sql,/from public,anon,authenticated/)
})
test('multi-club contexts do not sum points; duplicate clubs retain their UUID',async()=>{
  const rows=(await db.query('select club_id,ranking_points from competition_player_standings_read where user_id=$1 order by club_id',[PLAYER])).rows
  assert.deepEqual(rows.map(r=>Number(r.ranking_points)),[9410,55]);assert.notEqual(rows[0].club_id,rows[1].club_id)
})
test('search original #5 alone stays #5; page boundaries do not truncate the universe',async()=>{
  const rows=(await db.query("select position from competition_player_standings_read where division_id=$1 and full_name ilike '%Nombre quinto%'",[DIVISION])).rows
  assert.equal(rows.length,1);assert.equal(rows[0].position,5)
  const count=(await db.query('select count(*)::integer as n from competition_player_standings_read where division_id=$1',[DIVISION])).rows[0].n
  assert.equal(count,59)
  const last=(await db.query('select position from competition_player_standings_read where division_id=$1 order by ordinal limit 25 offset 50',[DIVISION])).rows
  assert.equal(last.length,9);assert.equal(last.at(-1).position,59)
})
test('staff excluded account-wide before positions; duplicate player names are distinct identities',async()=>{
  assert.equal((await db.query('select * from competition_player_standings_read where user_id=$1',[id(1002)])).rows.length,0)
  const rows=(await db.query("select user_id from competition_player_standings_read where full_name='Álex Torres'")).rows
  assert.equal(rows.length,2);assert.notEqual(rows[0].user_id,rows[1].user_id)
})
test('null winner, BYE, WO, administrative and cancelled registration are not played matches',()=>{
  const match={status:'PLAYED',team1_id:'a',team2_id:'b',winner_team_id:'a',score:{}}
  assert.equal(rules.computableMatch(match),true)
  for(const change of [{winner_team_id:null},{team2_id:null},{status:'PENDING'},{score:{walkover:true}},{score:{type:'BYE'}},{score:{administrative:true}},{score:{text:'WO'}}]) assert.equal(rules.computableMatch({...match,...change}),false)
  assert.equal(rules.winRate(0,0),null)
})
test('official summary counts actual wins/losses and current placements, not registrations',async()=>{
  const r=(await db.query('select * from read_player_career_summary($1,$2)',[CLUB_PLAYER,SEASON])).rows[0]
  const {best_result,best_position,...counts}=r
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,Number(v)])),{tournaments_played:4,matches_played:4,wins:2,losses:2,titles:2,finals:3,semifinals:1})
  assert.equal(best_result,'CHAMPION');assert.equal(best_position,1)
  const empty=(await db.query('select * from read_player_career_summary($1,$2)',[id(2020),SEASON])).rows[0]
  assert.equal(Number(empty.matches_played),0);assert.equal(Number(empty.titles),0)
})
test('nonscoring finals retain sporting achievement; reversed points do not revoke a title',async()=>{
  const rows=(await db.query('select * from player_career_results_read where user_id=$1 order by sports_date',[PLAYER])).rows
  assert.equal(rows[0].category,5);assert.equal(rows[0].partner_name,'Pareja histórica');assert.equal(Number(rows[0].points),0)
  assert.equal(rows[1].result_role,'RUNNER_UP');assert.equal(Number(rows[1].points),0)
  assert.equal(rows[2].result_role,'SEMIFINALIST');assert.equal(rows.length,4)
  assert.equal(rows.filter(r=>r.result_role==='CHAMPION').length,2)
})
test('PAIRS uses its real division and team award once, not a sum of individual careers',async()=>{
  const rows=(await db.query('select division_id,combined_points,position from competition_pair_standings_read')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].division_id,id(21));assert.equal(Number(rows[0].combined_points),10);assert.equal(rows[0].position,1)
  assert.notEqual(rows[0].division_id,DIVISION)
})
test('career includes closed seasons and history pages are bounded without treating registration as play',async()=>{
  await db.exec('begin')
  try {
    await db.exec(`
      insert into competition_seasons values ('${id(15)}','${CLUB}','Temporada 2025','CLOSED');
      insert into competition_divisions(id,club_id,season_id,branch_id,category_id,modality,is_active) values ('${id(25)}','${CLUB}','${id(15)}','${id(31)}','${id(41)}','INDIVIDUAL',false);
      insert into competition_series_divisions values ('${id(95)}','${CLUB}','${id(25)}');
      insert into competition_series_event_divisions values ('${id(96)}','${CLUB}','${id(95)}');
    `)
    for(let n=1;n<=12;n++) {
      await db.query('insert into tournaments(id,club_id,name,category,start_date,status) values ($1,$2,$3,5,$4,\'FINISHED\')',[id(15500+n),CLUB,'Historia 2025 '+n,'2025-09-'+String(n).padStart(2,'0')])
      await db.query('insert into competition_event_homologations(id,club_id,event_id,event_division_id,tournament_id,status) values ($1,$2,$3,$4,$5,\'APPROVED\')',[id(16500+n),CLUB,id(17500+n),id(96),id(15500+n)])
      await db.query('insert into competition_event_homologation_participants(id,club_player_id,player_id,club_id,homologation_id,result_role,final_position,participation_status) values ($1,$2,$3,$4,$5,\'RUNNER_UP\',2,\'FINISHED\')',[id(18500+n),CLUB_PLAYER,PLAYER,CLUB,id(16500+n)])
    }
    const all=(await db.query('select * from read_player_career_summary($1,null)',[CLUB_PLAYER])).rows[0]
    const annual=(await db.query('select * from read_player_career_summary($1,$2)',[CLUB_PLAYER,SEASON])).rows[0]
    assert.equal(Number(all.tournaments_played),16);assert.equal(Number(all.finals),15);assert.equal(Number(all.matches_played),4)
    assert.equal(Number(annual.tournaments_played),4)
    const page1=(await db.query('select id from player_career_results_read where club_player_id=$1 order by sports_date desc,id limit 11',[CLUB_PLAYER])).rows
    const page2=(await db.query('select id from player_career_results_read where club_player_id=$1 order by sports_date desc,id limit 11 offset 10',[CLUB_PLAYER])).rows
    assert.equal(page1.length,11);assert.equal(page2.length,6)
    assert.ok(!page1.slice(0,10).some(a=>page2.some(b=>a.id===b.id)))
  } finally {await db.exec('rollback')}
})
test('public route is outside RoleGate and carries no private DTO or controls',()=>{
  const page=src('../app/jugadores/[id]/page.tsx')
  assert.match(page,/generateMetadata/);assert.doesNotMatch(page,/own=1|email|birth_date|phone|balance|membership.*role/)
  const api=src('../app/api/players/[playerId]/career/route.ts')
  assert.doesNotMatch(api,/auth\.getUser|Authorization|birth_date|email|phone|payments/)
  assert.match(api,/no-store/)
  assert.doesNotMatch(src('../components/public/PublicClubHomeExperience.tsx'),/demoRankingCategory|mergeDemoBranches|Vista demo|Joaquín Pereyra|Lucía Galarza/)
})
test('public projection has no contact/private fields; own endpoint keeps authorization',async()=>{
  const keys=Object.keys((await db.query('select * from competition_player_standings_read limit 1')).rows[0])
  assert.ok(!keys.some(k=>/email|birth|phone|dni|role|private|debt/.test(k)))
  const own=src('../app/api/clubs/[clubId]/players/[playerId]/profile/route.ts')
  assert.match(own,/identity\.userId!==user\.id/);assert.match(own,/private, no-store/)
  assert.match(src('../app/api/player/my-ranking/route.ts'),/auth\.getUser/)
  assert.match(src('../app/api/player/my-ranking/route.ts'),/playerAccountDenial/)
  const editor=src('../app/(app)/club/jugadores/[id]/page.tsx')
  assert.doesNotMatch(editor,/player: \{ \.\.\.current\.player, \.\.\.json\.player/)
  assert.match(src('../app/(app)/player/carrera/[id]/editar/page.tsx'),/club\/jugadores\/\[id\]\/page/)
})
test('ranking/home do not download admin engine; history/recent requested lazily and bounded',()=>{
  const page=src('../app/ranking/page.tsx');assert.doesNotMatch(page,/limit\(240\)|club_players|ranking_points/)
  const personal=src('../app/(app)/player/ranking/page.tsx');assert.doesNotMatch(personal,/withRankingPositions|sortRankingRows|api\/clubs\/.*\/ranking/)
  const repo=src('../features/player-career/player-career.repository.ts');assert.doesNotMatch(repo,/select\(['"]\*['"]\)|listEvents|getRankingPipeline/)
  assert.match(repo,/gte\('ordinal'/);assert.match(repo,/range\(start,start\+PAGE_SIZE-1\)/)
})
test('universe exceeds legacy 240 and ledger exceeds provider page size without lost points',async()=>{
  await db.exec('begin')
  try {
    await db.exec(`
      insert into profiles(user_id,id,display_name)
        select ('00000000-0000-4000-8000-'||lpad((200000+n)::text,12,'0'))::uuid,('00000000-0000-4000-8000-'||lpad((200000+n)::text,12,'0'))::uuid,'Extra '||n from generate_series(1,251) n;
      insert into club_players(id,club_id,user_id,approved_at)
        select ('00000000-0000-4000-8000-'||lpad((300000+n)::text,12,'0'))::uuid,'${CLUB}',('00000000-0000-4000-8000-'||lpad((200000+n)::text,12,'0'))::uuid,now() from generate_series(1,251) n;
      insert into club_memberships(id,club_id,user_id,role,status,approved_at)
        select ('00000000-0000-4000-8000-'||lpad((400000+n)::text,12,'0'))::uuid,'${CLUB}',('00000000-0000-4000-8000-'||lpad((200000+n)::text,12,'0'))::uuid,'PLAYER','APPROVED',now() from generate_series(1,251) n;
      insert into competition_player_entries(id,club_id,club_player_id,division_id,status)
        select ('00000000-0000-4000-8000-'||lpad((500000+n)::text,12,'0'))::uuid,'${CLUB}',('00000000-0000-4000-8000-'||lpad((300000+n)::text,12,'0'))::uuid,'${DIVISION}','ACTIVE' from generate_series(1,251) n;
      insert into competition_point_transactions(id,club_id,season_id,division_id,player_entry_id,club_player_id,points,metadata)
        select ('00000000-0000-4000-8000-'||lpad((600000+n)::text,12,'0'))::uuid,'${CLUB}','${SEASON}','${DIVISION}','${id(3020)}','${id(2020)}',1,'{}' from generate_series(1,1501) n;
    `)
    const count=(await db.query('select count(*)::integer as n from competition_player_standings_read where division_id=$1',[DIVISION])).rows[0].n
    assert.equal(count,310)
    const total=(await db.query('select ranking_points from competition_player_standings_read where club_player_id=$1',[id(2020)])).rows[0].ranking_points
    assert.equal(Number(total),9501)
    const end=(await db.query('select club_player_id from competition_player_standings_read where division_id=$1 order by ordinal limit 25 offset 300',[DIVISION])).rows
    assert.equal(end.length,10)
  } finally {await db.exec('rollback')}
})
test('anonymous and authenticated roles cannot select read models or execute summary directly',async()=>{
  const result=(await db.query(`select has_table_privilege('anon','public.player_career_results_read','select') as anon_read,
    has_table_privilege('authenticated','public.competition_player_standings_read','select') as user_read,
    has_function_privilege('anon','public.read_player_career_summary(uuid,uuid)','execute') as anon_execute`)).rows[0]
  assert.deepEqual(result,{anon_read:false,user_read:false,anon_execute:false})
})
