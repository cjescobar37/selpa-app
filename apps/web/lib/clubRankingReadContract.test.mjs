import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url), ts = require('typescript')
const CLUB='00000000-0000-4000-8000-000000000001', OTHER='00000000-0000-4000-8000-000000000002'
const SEASON='00000000-0000-4000-8000-000000000010', DIVISION='00000000-0000-4000-8000-000000000021'
const response={NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}}
function compile(file,imports={}) {
  const m={exports:{}}, code=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    module:m,exports:m.exports,URL,URLSearchParams,Request,console,require:name=>name in imports?imports[name]:require(name),
  })
  return m.exports
}
const rules=compile('features/player-career/player-career.rules.ts')
const presentation=compile('features/player-career/public-ranking.presentation.ts')
const request=(query='',body)=>Object.assign(new Request('http://localhost/'+query,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer qa-only','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{nextUrl:new URL('http://localhost/'+query)})
function rankingAccess(allow=true) {
  return compile('features/player-career/club-ranking.access.ts',{'server-only':{},
    '@/features/competition/catalogs/competition-catalogs.auth':{authorizeCompetitionCatalog:async(_req,club,mode)=>{
      assert.equal(mode,'read');return {error:allow&&club===CLUB?null:{status:403}}
    }},
  })
}
test('private ranking requires a request-local ranking capability; forged or foreign-club proof fails',async()=>{
  const access=rankingAccess(), grant=(await access.authorizeClubRankingRead(request(),CLUB)).access
  assert.equal(access.assertClubRankingRead(undefined,CLUB),false)
  assert.equal(access.assertClubRankingRead(grant,CLUB),true)
  assert.throws(()=>access.assertClubRankingRead({clubId:CLUB},CLUB),/ACCESS_DENIED/)
  assert.throws(()=>access.assertClubRankingRead(grant,OTHER),/ACCESS_DENIED/)
  assert.equal((await rankingAccess(false).authorizeClubRankingRead(request(),CLUB)).error.status,403)
})
function reader({privateSeason=false,hiddenBranch=false,readError=null,ownPair=null,ownCounts=null}={}) {
  const calls=[], access=rankingAccess()
  const tables={
    competition_seasons:[{id:SEASON,club_id:CLUB,name:'2026',status:'ACTIVE',is_public:!privateSeason}],
    competition_branches:[{id:'branch',club_id:CLUB,slug:'caballeros',is_active:true,is_visible:!hiddenBranch}],
    competition_categories:[{id:'category',club_id:CLUB,name:'6ª categoría',legacy_category_id:6,is_active:true,is_visible:true}],
    competition_segments:[{id:'group',club_id:CLUB,name:'Libres',is_active:true,is_visible:true}],
    competition_divisions:[{id:DIVISION,club_id:CLUB,season_id:SEASON,category_id:'category',branch_id:'branch',segment_id:'group',modality:'PAIRS',is_active:true,is_visible:true}],
  }
  tables.public_competition_contexts_read=privateSeason||hiddenBranch?[]:tables.competition_divisions
  const db={from(table){
    const call={table,filters:[]};calls.push(call)
    const q={select(columns,options){call.columns=columns;call.options=options;return q},eq(...args){call.filters.push(['eq',...args]);return q},
      is(...args){call.filters.push(['is',...args]);return q},in(...args){call.filters.push(['in',...args]);return q},
      order(){return q},range(){return q},limit(){return q},or(...args){call.or=args;return q},lt(...args){call.filters.push(['lt',...args]);return q},
      then(resolve,reject){
        let data=tables[table]??[]
        if(ownPair&&table==='public_pair_standings_read'&&call.or)data=[ownPair]
        for(const [op,key,value] of call.filters)data=data.filter(row=>op==='eq'?row[key]===value:op==='in'?value.includes(row[key]):true)
        const count=ownCounts&&table==='public_pair_standings_read'&&!call.or?(call.filters.some(f=>f[0]==='eq'&&f[1]==='position')?ownCounts.tied:ownCounts.higher):0
        return Promise.resolve({data,error:readError&&table.includes('standings')?{code:readError}:null,count}).then(resolve,reject)
      }}
    return q
  }}
  const repo=compile('features/player-career/player-career.repository.ts',{
    'server-only':{},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/accountRoleServer':{},
    './player-career.rules':rules,'./public-ranking.presentation':presentation,'./my-ranking.state':{},
    './player-career.access':{PUBLIC_CAREER:{kind:'public'},assertCareerAccess(){},CareerAccessError:class extends Error{}},
    './club-ranking.access':access,
  })
  return {repo,calls,access}
}
test('private season is unavailable to the public reader; authorized internal reader keeps the pairs group',async()=>{
  const {repo,calls,access}=reader({privateSeason:true})
  assert.equal((await repo.readRankingContexts(CLUB,SEASON)).length,0)
  assert.equal(calls.some(c=>c.table==='competition_divisions'),false)
  const grant=(await access.authorizeClubRankingRead(request(),CLUB)).access
  const contexts=await repo.readRankingContexts(CLUB,SEASON,grant)
  assert.equal(contexts.length,1);assert.equal(contexts[0].segmentId,'group');assert.equal(contexts[0].segmentName,'Libres')
  assert.equal(contexts[0].divisionId,DIVISION)
})
test('public and private standings stay separate and retain exact club/season/division scope',async()=>{
  const {repo,calls,access}=reader(),context={clubId:CLUB,seasonId:SEASON,divisionId:DIVISION,modality:'PAIRS'}
  const grant=(await access.authorizeClubRankingRead(request(),CLUB)).access
  await repo.readPairRankingPage(context,'',2)
  await repo.readPairRankingPage(context,'',2,grant)
  assert.deepEqual(calls.map(c=>c.table),['public_pair_standings_read','competition_pair_standings_read'])
  for(const call of calls)for(const [column,value]of [['club_id',CLUB],['season_id',SEASON],['division_id',DIVISION]])assert.ok(call.filters.some(f=>f[1]===column&&f[2]===value))
  await assert.rejects(repo.readPairRankingPage(context,'',1,{clubId:CLUB}),/ACCESS_DENIED/)
  assert.equal(calls.length,2)
})
test('hiding a branch never forces an admin to publish it in order to inspect its official ranking',async()=>{
  const {repo,access}=reader({hiddenBranch:true})
  assert.equal((await repo.readRankingContexts(CLUB,SEASON)).length,0)
  assert.equal((await repo.readRankingBranches(CLUB)).length,0)
  const grant=(await access.authorizeClubRankingRead(request(),CLUB)).access
  const contexts=await repo.readRankingContexts(CLUB,SEASON,grant)
  assert.equal(contexts.length,1);assert.equal((await repo.readRankingBranches(CLUB,grant))[0],'M')
  assert.equal(await repo.readRankingContextPublished(contexts[0]),false)
})
test('missing official models remain errors rather than fake zero/legacy points',async()=>{
  const {repo}=reader({readError:'PGRST205'})
  await assert.rejects(repo.readPairRankingPage({clubId:CLUB,seasonId:SEASON,divisionId:DIVISION}),error=>error.code==='PGRST205')
})
test('internal navigation is explicit but cannot serve as a permission proof; defaults stay PAIRS/M',()=>{
  const contexts=[{clubId:CLUB,seasonId:SEASON,divisionId:DIVISION,modality:'PAIRS',gender:'M',category:6,rankedCount:2},{clubId:CLUB,seasonId:SEASON,divisionId:'f',modality:'PAIRS',gender:'F',category:6,rankedCount:20}]
  assert.equal(presentation.rankingContext(contexts,{},'PAIRS').gender,'M')
  const href=presentation.rankingHref({scope:'club',clubId:CLUB,modality:'PAIRS'})
  assert.ok(href.startsWith('/club/ranking?'));assert.equal(href.includes('scope='),false)
})
test('public URL normalization handles repeated params, bounds search and ignores privileged/demo hints',()=>{
  const params=presentation.rankingSearchParams({q:['a'.repeat(100),'other'],gender:['M','F'],scope:'club',demo:'1',clubId:CLUB})
  assert.equal(params.q.length,80);assert.equal(params.gender,'M');assert.equal(params.scope,undefined);assert.equal(params.demo,undefined)
  assert.equal(params.clubId,CLUB)
})
test('own pair page counts preceding ties; official position is never used as the row offset',async()=>{
  const row={club_id:CLUB,season_id:SEASON,division_id:DIVISION,partnership_id:'pair-key',player1_name:'Own',player2_name:'Partner',position:5,combined_points:600}
  const {repo,calls}=reader({ownPair:row,ownCounts:{higher:4,tied:26}})
  const mine=await repo.readOwnPublishedRanking({clubId:CLUB,seasonId:SEASON,divisionId:DIVISION,modality:'PAIRS'},{kind:'self',userId:'verified-self'})
  assert.equal(mine.position,5);assert.equal(mine.points,600);assert.equal(mine.page,2)
  assert.equal(calls.length,3);assert.ok(calls.every(c=>c.table==='public_pair_standings_read'))
  assert.match(calls[0].or[0],/player1_user_id.eq.verified-self,player2_user_id.eq.verified-self/)
  for(const call of calls.slice(1))assert.equal(call.columns,'partnership_id')
})
test('personal marker uses verified account and published context, ignoring a foreign userId or scope parameter',async()=>{
  let ownCalls=0
  const self={kind:'self',userId:'verified-self'}
  const handler=compile('app/api/player/club-ranking-position/route.ts',{
    'next/server':response,'@/features/player-career/player-career.access':{verifySelfCareer:async()=>self,CareerAccessError:class extends Error{}},
    '@/features/player-career/player-career.rules':rules,
    '@/features/player-career/player-career.repository':{
      readRankingContexts:async()=>[{clubId:CLUB,seasonId:SEASON,divisionId:DIVISION,modality:'PAIRS'}],
      readOwnPublishedRanking:async(context,access)=>{ownCalls++;assert.equal(access,self);assert.equal(context.divisionId,DIVISION);return {position:19}},
    },
  })
  const query='?clubId='+CLUB+'&season='+SEASON+'&division='+DIVISION+'&modality=PAIRS&userId=foreign&scope=club'
  const result=await handler.GET(request(query))
  assert.equal(result.status,200);assert.equal(result.body.position.position,19);assert.equal(ownCalls,1)
  assert.equal(result.headers['Cache-Control'],'private, no-store')
  assert.equal((await handler.GET(request('?clubId=bad'))).status,400);assert.equal(ownCalls,1)
})
test('publication PATCH enforces owner/admin authorization before any write',async()=>{
  let writes=0
  const handler=compile('app/api/clubs/[clubId]/ranking/visibility/route.ts',{'next/server':response,
    '@/features/competition/catalogs/competition-catalogs.auth':{authorizeCompetitionCatalog:async(_req,club,mode)=>{assert.equal(mode,'write');assert.equal(club,CLUB);return {error:{status:403}}}},
    '@/features/player-career/player-career.rules':rules,'@/lib/supabaseAdmin':{supabaseAdmin:{from(){writes++;throw Error('UNAUTHORIZED_WRITE')}}},
  })
  const result=await handler.PATCH(request('',{id:DIVISION,visible:true,expectedUpdatedAt:'2026-11-03T00:00:00Z'}),{params:Promise.resolve({clubId:CLUB})})
  assert.equal(result.status,403);assert.equal(writes,0)
})
test('publication PATCH changes one existing visibility flag, scopes club/id/version and rejects stale writes',async()=>{
  const calls=[]
  const db={from(table){
    assert.equal(table,'competition_branches')
    const q={update(value){calls.push(['update',value]);return q},eq(...v){calls.push(['eq',...v]);return q},in(...v){calls.push(['in',...v]);return q},select(){return q},maybeSingle:async()=>({data:null,error:null})};return q
  }}
  const handler=compile('app/api/clubs/[clubId]/ranking/visibility/route.ts',{'next/server':response,
    '@/features/competition/catalogs/competition-catalogs.auth':{authorizeCompetitionCatalog:async()=>({error:null})},
    '@/features/player-career/player-career.rules':rules,'@/lib/supabaseAdmin':{supabaseAdmin:db},
  })
  const result=await handler.PATCH(request('',{id:DIVISION,visible:false,expectedUpdatedAt:'2026-11-03T00:00:00Z',club_id:OTHER,is_public:true,is_active:true,points:9999}),{params:Promise.resolve({clubId:CLUB})})
  assert.equal(result.status,409)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),['update',{is_visible:false}])
  for(const [column,value]of [['club_id',CLUB],['id',DIVISION],['updated_at','2026-11-03T00:00:00Z']])assert.ok(calls.some(c=>c[0]==='eq'&&c[1]===column&&c[2]===value))
  assert.equal(calls.filter(c=>c[0]==='update').length,1)
})
