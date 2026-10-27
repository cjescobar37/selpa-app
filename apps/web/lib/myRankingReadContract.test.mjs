import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function compile(file,imports={}) {
  const compiledModule={exports:{}}
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,require:name=>name in imports?imports[name]:require(name)})
  return compiledModule.exports
}
const state=compile('features/player-career/my-ranking.state.ts')
const rules=compile('features/player-career/player-career.rules.ts')
const presentation=compile('features/player-career/public-ranking.presentation.ts')
const me={club_id:'club',club_player_id:'player',user_id:'user',season_id:'season',season_name:'2026',division_id:'division',player_entry_id:'entry',position:53,ordinal:53,ranking_points:100,modality:'INDIVIDUAL',gender:'M',category:6}
const identity={userId:'user',selectedClubPlayerId:'player',contexts:[{clubPlayerId:'player',clubId:'club'}]}
function reader(options={}) {
  const calls=[]
  const db={from(table){
    const call={table,filters:[]};calls.push(call)
    const query={select(columns,opts){call.columns=columns;call.opts=opts;return query},eq(...v){call.filters.push(['eq',...v]);return query},is(...v){call.filters.push(['is',...v]);return query},or(){return query},order(){return query},limit(n){call.limit=n;return query},lt(...v){call.filters.push(['lt',...v]);return query},range(from,to){call.range=[from,to];return query},maybeSingle(){call.single=true;return query},then(resolve,reject){
      let data=[]
      if(table==='competition_seasons')data=options.noSeason?[]:[{id:'season',name:'2026',is_public:!options.private}]
      if(table==='competition_player_standings_read')data=options.noStanding?[]:[me]
      if(table==='competition_player_entries')data=options.noEntry?[]:[{id:'entry'}]
      if(table==='public_competition_contexts_read')data=options.hiddenDivision?[]:[{id:'division'}]
      if(table==='public_player_standings_read')data=call.range?[{...me,user_id:'another',position:26,ordinal:26}]:[{...me,user_id:'leader',position:1,ordinal:1,ranking_points:1000}]
      const error=options.publicError&&table==='public_player_standings_read'?{code:'42501'}:null
      return Promise.resolve({data:call.single?data[0]??null:data,error,count:59}).then(resolve,reject)
    }}
    return query
  },rpc(){return Promise.resolve({data:[{tournaments_played:0,matches_played:0,wins:0,losses:0,titles:0,finals:0,semifinals:0}],error:options.missing?{code:'PGRST202'}:null})}}
  const repository=compile('features/player-career/player-career.repository.ts',{
    'server-only':{},'@/lib/supabaseAdmin':{supabaseAdmin:db},'@/lib/accountRoleServer':{},
    './player-career.rules':rules,'./public-ranking.presentation':presentation,'./my-ranking.state':state,
    './player-career.access':{PUBLIC_CAREER:{kind:'public'},assertCareerAccess(){},CareerAccessError:class extends Error{}},
  })
  return {read:page=>repository.readMyRanking(identity,{kind:'self',userId:'user'},page),calls}
}
test('actual personal reader paginates public competitors within the exact division and keeps own standing separate',async()=>{
  const {read,calls}=reader();const result=await read(2)
  assert.equal(result.state,'READY');assert.equal(result.summary.standing.position,53);assert.equal(result.individual[0].position,26)
  assert.equal(result.participants.count,59);assert.equal(result.participants.page,2)
  const page=calls.find(c=>c.table==='public_player_standings_read'&&c.range)
  assert.deepEqual(page.range,[25,49])
  for(const [column,value] of [['club_id','club'],['season_id','season'],['division_id','division']])assert.ok(page.filters.some(f=>f[1]===column&&f[2]===value))
})
test('actual personal reader never requests private competitors or a hidden division',async()=>{
  for(const options of [{private:true},{hiddenDivision:true}]) {
    const {read,calls}=reader(options),result=await read(1)
    assert.equal(result.summary.standing.position,53);assert.equal(result.participants.visible,false)
    assert.equal(calls.filter(c=>c.table==='public_player_standings_read').length,0)
  }
})
test('actual personal reader distinguishes missing season, sports entry and unpublished official position',async()=>{
  for(const [options,expected] of [[{noStanding:true,noSeason:true},'NO_OFFICIAL_RANKING'],[{noStanding:true,noEntry:true},'NO_SPORTS_ENTRY'],[{noStanding:true},'NO_OFFICIAL_RANKING']])assert.equal((await reader(options).read(1)).state,expected)
})
test('actual personal reader preserves missing-model failure and does not turn permission errors into an empty ranking',async()=>{
  await assert.rejects(reader({missing:true}).read(1),error=>error.code==='MODEL_UNAVAILABLE')
  await assert.rejects(reader({publicError:true}).read(1),error=>error.code==='42501')
})
