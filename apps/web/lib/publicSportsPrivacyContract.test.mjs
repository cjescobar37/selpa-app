import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {createFixture,id,CLUB,SEASON,CLUB_PLAYER} from '../scripts/qa/block1-fixture.mjs'
import {addSportsPrivacyFixture} from './testHelpers/sportsPrivacyFixture.mjs'
const db=await createFixture();await addSportsPrivacyFixture(db);test.after(()=>db.close())
async function transaction(run){await db.exec('begin');try{await run()}finally{await db.exec('rollback')}}
async function count(table){return Number((await db.query('select count(*) as n from '+table)).rows[0].n)}
const tables=['public_competition_contexts_read','public_player_standings_read','public_pair_standings_read','public_player_career_results_read','public_player_career_matches_read']
const summary=async(publicRead=true)=>(await db.query(`select * from ${publicRead?'read_public_player_career_summary':'read_player_career_summary'}($1,null)`,[CLUB_PLAYER])).rows[0]
test('public ACTIVE season preserves exact official positions/points and both PAIRS identities',async()=>{
  const full=(await db.query('select user_id,ranking_points,position from competition_player_standings_read order by user_id')).rows
  const published=(await db.query('select user_id,ranking_points,position from public_player_standings_read order by user_id')).rows
  assert.deepEqual(published,full);assert.ok(await count('public_pair_standings_read')>0)
})
test('ACTIVE private season is denied by SQL views, even under backend read privileges',()=>transaction(async()=>{
  await db.query('update competition_seasons set is_public=false where id=$1',[SEASON])
  await db.exec('set local role service_role')
  for(const table of tables)assert.equal(Number((await db.query('select count(*) as n from '+table+' where '+(table==='public_competition_contexts_read'?'season_id':'season_id')+'=$1',[SEASON])).rows[0].n),0)
  assert.ok(await count('competition_player_standings_read')>0);assert.equal(Number((await summary()).tournaments_played),0);assert.ok(Number((await summary(false)).tournaments_played)>0)
}))
test('DRAFT and ARCHIVED cannot expose public career/ranking even with is_public=true',()=>transaction(async()=>{
  for(const status of ['DRAFT','ARCHIVED']){await db.query('update competition_seasons set status=$1 where id=$2',[status,SEASON]);assert.equal(Number((await summary()).tournaments_played),0);assert.equal(Number((await db.query('select count(*) as n from public_player_standings_read where season_id=$1',[SEASON])).rows[0].n),0)}
}))
test('CLOSED public season retains public history; private CLOSED season does not',()=>transaction(async()=>{
  await db.query('update competition_seasons set status=$1 where id=$2',['CLOSED',SEASON]);assert.ok(Number((await summary()).titles)>0)
  await db.query('update competition_seasons set is_public=false where id=$1',[SEASON]);assert.equal(Number((await summary()).titles),0)
}))
test('private/cancelled/draft series hide result details without rewriting annual totals',()=>transaction(async()=>{
  const before=(await db.query('select ranking_points,position from public_player_standings_read where club_player_id=$1',[CLUB_PLAYER])).rows
  for(const [status,published] of [['ACTIVE',false],['DRAFT',true],['SCHEDULED',true],['CANCELLED',true]]){await db.query('update competition_series set status=$1,is_public=$2',[status,published]);assert.equal(Number((await summary()).tournaments_played),0);assert.deepEqual((await db.query('select ranking_points,position from public_player_standings_read where club_player_id=$1',[CLUB_PLAYER])).rows,before)}
}))
test('private/draft/cancelled or unfinished event cannot contribute public summary/history/recent',()=>transaction(async()=>{
  const full=await summary(false)
  for(const [status,published] of [['COMPLETED',false],['DRAFT',true],['SCHEDULED',true],['CANCELLED',true]]){await db.query('update competition_series_events set status=$1,is_public=$2',[status,published]);assert.equal(await count('public_player_career_results_read'),0);assert.equal(await count('public_player_career_matches_read'),0);assert.equal(Number((await summary()).titles),0)}
  assert.deepEqual(await summary(false),full)
}))
test('hidden division/branch/category and cancelled tournament do not expose details',()=>transaction(async()=>{
  for(const [table,field] of [['competition_divisions','is_visible'],['competition_branches','is_visible'],['competition_categories','is_visible']]){await db.query(`update ${table} set ${field}=false`);assert.equal(await count('public_competition_contexts_read'),0);assert.equal(await count('public_player_career_results_read'),0);await db.query(`update ${table} set ${field}=true`)}
  await db.exec("update tournaments set status='CANCELLED'");assert.equal(await count('public_player_career_results_read'),0)
}))
test('archived series/events or removed event divisions cannot expose historical details',()=>transaction(async()=>{
  for(const table of ['competition_series','competition_series_events']){await db.exec(`update ${table} set archived_at=now()`);assert.equal(await count('public_player_career_results_read'),0);await db.exec(`update ${table} set archived_at=null`)}
  await db.exec('update competition_series_event_divisions set is_active=false');assert.equal(await count('public_player_career_results_read'),0)
  await db.exec('update competition_series_event_divisions set is_active=true,removed_at=now()');assert.equal(await count('public_player_career_results_read'),0)
}))
test('public context with no entries is honest zero, not missing model or invented player',()=>transaction(async()=>{
  await db.exec('delete from competition_player_entries');assert.ok(await count('public_competition_contexts_read')>0);assert.equal(await count('public_player_standings_read'),0)
}))
test('public view and RPC grants stay backend-only for every new object',async()=>{
  for(const table of tables){const r=(await db.query('select has_table_privilege($1,$2,$3) as allowed',['anon',table,'SELECT'])).rows[0];assert.equal(r.allowed,false);assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['authenticated',table,'SELECT'])).rows[0].allowed,false);assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['service_role',table,'SELECT'])).rows[0].allowed,true)}
  assert.equal((await db.query("select has_function_privilege('anon','read_public_player_career_summary(uuid,uuid)','EXECUTE') as allowed")).rows[0].allowed,false)
})
test('anonymous/authenticated direct SQL reads actually fail; backend filtering is not UI-only',async()=>{
  for(const role of ['anon','authenticated'])await transaction(async()=>{await db.exec('set local role '+role);await assert.rejects(db.query('select * from public_player_standings_read'),/permission denied/)})
})
const require=createRequire(import.meta.url),ts=require('typescript'),read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
function compile(file,imports){const m={exports:{}};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Request,WeakSet,Object,require:n=>n in imports?imports[n]:require(n)});return m.exports}
function accessModule({user='self',denied=false,admin=false}={}){return compile('../features/player-career/player-career.access.ts',{'server-only':{},'next/server':{NextRequest:Request},'@/lib/supabaseAdmin':{supabaseAdmin:{auth:{getUser:async()=>({data:{user:user?{id:user}:null},error:null})}}},'@/lib/accountRoleServer':{playerAccountDenial:async()=>denied?{}:null},'@/lib/clubMembershipServer':{requireClubCapability:async(_req,club,cap)=>({error:admin&&club===CLUB&&cap==='players:view'?null:{status:403}})},'./player-career.rules':{validId:s=>/^[0-9a-f-]{36}$/.test(s)}})}
const request=token=>new Request('http://local.test',{headers:token?{Authorization:'Bearer synthetic'}:{}})
test('self access rejects absent/invalid JWT, STAFF, foreign identity and forged capability',async()=>{
  const a=accessModule();await assert.rejects(a.verifySelfCareer(request(false)),e=>e.status===401)
  await assert.rejects(accessModule({user:null}).verifySelfCareer(request(true)),e=>e.status===401)
  await assert.rejects(accessModule({denied:true}).verifySelfCareer(request(true)),e=>e.status===403)
  const own=await a.verifySelfCareer(request(true));assert.doesNotThrow(()=>a.assertCareerAccess(own,'self',CLUB));assert.throws(()=>a.assertCareerAccess(own,'other',CLUB),e=>e.status===403)
  assert.throws(()=>a.assertCareerAccess({kind:'self',userId:'self'},'self',CLUB),e=>e.status===403)
})
test('admin capability is scoped to validated club; PLAYER/foreign club cannot promote themselves',async()=>{
  const a=accessModule({admin:true}),grant=await a.verifyAdminCareer(request(true),CLUB)
  assert.doesNotThrow(()=>a.assertCareerAccess(grant,'any-player',CLUB));assert.throws(()=>a.assertCareerAccess(grant,'any-player',id(2)),e=>e.status===403)
  await assert.rejects(a.verifyAdminCareer(request(true),id(2)),e=>e.status===403);await assert.rejects(accessModule().verifyAdminCareer(request(true),CLUB),e=>e.status===403)
  assert.throws(()=>a.assertCareerAccess({kind:'admin',clubId:CLUB},'any-player',CLUB),e=>e.status===403)
})
test('all public SQL consumers use guarded projections; own client uses bearer private route',()=>{
  const repo=read('../features/player-career/player-career.repository.ts')
  for(const name of ['public_competition_contexts_read','public_player_standings_read','public_pair_standings_read','public_player_career_matches_read','public_player_career_results_read','read_public_player_career_summary'])assert.ok(repo.includes(name))
  assert.match(repo,/eq\('is_public',true\)/);assert.match(repo,/assertCareerAccess\(access,identity.userId/)
  const ownRanking=repo.slice(repo.indexOf('export async function readMyRanking'),repo.indexOf('export async function readPublicClubs'))
  assert.match(ownRanking,/const base=\(\)=>db.from\('public_player_standings_read'\)/)
  assert.doesNotMatch(ownRanking,/from\('competition_player_standings_read'\)/)
  assert.match(read('../components/player/CareerExperience.tsx'),/own\?`\/api\/player\/career\//)
  assert.match(read('../app/api/clubs/[clubId]/players/[playerId]/career/route.ts'),/verifyAdminCareer\(request,clubId\)/)
})
