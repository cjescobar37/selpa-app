import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8')
function compile(path,imports={}) {
  const compiledModule={exports:{}}
  const js=ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(js,{module:compiledModule,exports:compiledModule.exports,URL,URLSearchParams,console:{warn(){}},require:name=>{
    if(name in imports)return imports[name]
    return require(name)
  }})
  return compiledModule.exports
}
const rules=compile('../features/player-career/public-ranking.presentation.ts')
const context=(gender='M',modality='INDIVIDUAL',category=6)=>({clubId:'club',seasonId:'season',seasonName:'2026',divisionId:gender+modality+category,category,categoryName:'6ª',gender,modality})
const contexts=[context('F'),context('M'),context('M','PAIRS')]
const nextResponse={NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}}
const standing=(position,points,id=position)=>({position,ranking_points:points,club_player_id:String(id),full_name:'Jugador '+id,category_name:'6ª',avatar_url:null,is_tied:position===1,user_id:'user'+id,club_id:'club'})

test('presentation preserves official positions, points, privacy and tied leaders',()=>{
  const entries=rules.individualRankingEntries([standing(1,900,1),standing(1,900,2),standing(3,750),standing(5,600),standing(26,50)])
  const tiers=rules.rankingTiers(entries)
  assert.deepEqual(Array.from(tiers.leaders,row=>row.position),[1,1])
  assert.deepEqual(Array.from(tiers.challengers,row=>row.position),[3,5])
  assert.equal(tiers.rest[0].position,26)
  assert.equal(tiers.challengers[1].points,600)
  assert.equal(tiers.challengers[1].href,'/jugadores/user5?clubId=club')
  assert.doesNotMatch(JSON.stringify(entries),/email|phone|birth|role|finance/)
})
test('search at #5 is a challenger, never promoted to a fictitious leader',()=>{
  const tiers=rules.rankingTiers(rules.individualRankingEntries([standing(5,600)]))
  assert.equal(tiers.leaders.length,0);assert.equal(tiers.challengers[0].position,5)
})
test('pairs show the canonical combined award once and both identities/photos',()=>{
  const pair={partnership_id:'pair',position:1,combined_points:400,player1_points:400,player2_points:400,player1_name:'A',player2_name:'B',player1_avatar_url:'/a.jpg',player2_avatar_url:null}
  const entry=rules.pairRankingEntries([pair])[0]
  assert.equal(entry.points,400);assert.equal(entry.avatars.length,2);assert.equal(entry.avatars[0].url,'/a.jpg');assert.equal(entry.href,null)
})
test('gender and modality change match the same canonical category, not stale division',()=>{
  assert.equal(rules.rankingContext(contexts,{division:'MINDIVIDUAL6',gender:'F'},'INDIVIDUAL').divisionId,'FINDIVIDUAL6')
  assert.equal(rules.rankingContext(contexts,{division:'MINDIVIDUAL6'},'PAIRS').divisionId,'MPAIRS6')
  assert.equal(rules.rankingContext(contexts,{division:'outside-scope'},'INDIVIDUAL'),null)
  assert.equal(rules.rankingContext(contexts,{},'INDIVIDUAL').gender,'M')
  assert.equal(rules.rankingContext([context('F')],{},'INDIVIDUAL').gender,'F')
})
test('published default uses greatest canonical population, not category number or M preference',()=>{
  const all=[{...context('M','INDIVIDUAL',1),rankedCount:3},{...context('F','INDIVIDUAL',7),rankedCount:9},{...context('M','PAIRS',7),rankedCount:999}]
  assert.equal(rules.rankingContext(all,{},'INDIVIDUAL').divisionId,'FINDIVIDUAL7')
  assert.equal(rules.rankingContext(all,{gender:'M'},'INDIVIDUAL').divisionId,'MINDIVIDUAL1')
  assert.equal(rules.rankingContext(all,{category:'1'},'INDIVIDUAL').divisionId,'MINDIVIDUAL1')
  assert.equal(rules.rankingContext(all,{division:'MINDIVIDUAL1'},'INDIVIDUAL').divisionId,'MINDIVIDUAL1')
})
test('tied populations use UUID order; no published division is an honest empty',()=>{
  const a={...context(),divisionId:'a',rankedCount:8},b={...context('F'),divisionId:'b',rankedCount:8}
  assert.equal(rules.rankingContext([b,a],{},'INDIVIDUAL').divisionId,'a')
  assert.equal(rules.rankingContext([{...a,rankedCount:0}],{},'INDIVIDUAL'),null)
  assert.equal(rules.rankingContext([{...a,rankedCount:0}],{category:'6'},'INDIVIDUAL').divisionId,'a')
})
test('registration never promotes payment evidence or checkout return into a confirmed place',()=>{
  const {registrationPresentation}=compile('./registrationPresentation.ts')
  for(const registration of [null,'PENDING','REJECTED'])for(const payment of [null,'PENDING','APPROVED','PAID','REJECTED','CANCELLED']) {
    const view=registrationPresentation(registration,payment)
    assert.equal(view.confirmed,false);assert.equal(view.title,'SOLICITUD REGISTRADA')
    assert.match(view.withdrawal,/cancelación de la solicitud/)
  }
  assert.equal(registrationPresentation('CONFIRMED','PENDING').confirmed,true)
  assert.equal(registrationPresentation('CANCELLED','PAID').title,'INSCRIPCIÓN CANCELADA')
})
test('financial diagnostics differentiate permissions, missing models, network, config and database',()=>{
  const {financeReadError}=compile('./financeReadError.ts')
  for(const [input,code,status] of [['42501','FORBIDDEN',403],['PGRST202','READ_MODEL_MISSING',503],['NETWORK','NETWORK_UNAVAILABLE',503],['CONFIGURATION_MISSING','CONFIGURATION_MISSING',503],['XX000','DATABASE_UNAVAILABLE',503],['22023','INVALID_FILTER',400]]) {
    const result=financeReadError({code:input});assert.equal(result.code,code);assert.equal(result.status,status)
    assert.doesNotMatch(JSON.stringify(result),/SQL|JWT|service_role/)
  }
})

test('actual personal handler preserves safe missing-model diagnostics, not private database messages',async()=>{
  for(const [sourceCode,code] of [['PGRST205','MODEL_UNAVAILABLE'],['PGRST000','READ_UNAVAILABLE']]) {
    const handler=compile('../app/api/player/my-ranking/route.ts',{'next/server':nextResponse,
      '@/features/player-career/my-ranking.state':compile('../features/player-career/my-ranking.state.ts'),
      '@/lib/supabaseAdmin':{supabaseAdmin:{auth:{getUser:async()=>({data:{user:{id:'player'}}})}}},
      '@/lib/accountRoleServer':{playerAccountDenial:async()=>null},
      '@/features/player-career/player-career.access':{verifySelfCareer:async()=>({kind:'self',userId:'player'}),CareerAccessError:class extends Error{}},
      '@/features/player-career/player-career.repository':{readCareerIdentity:async()=>({selectedClubPlayerId:'approved-player'}),readMyRanking:async()=>{throw {code:sourceCode,message:'PRIVATE_SQL_JWT'}}}})
    const response=await handler.GET(new Request('http://localhost/api/player/my-ranking',{headers:{Authorization:'Bearer qa-only'}}))
    assert.equal(response.status,503);assert.equal(response.body.code,code);assert.equal(response.headers['Cache-Control'],'private, no-store')
    assert.doesNotMatch(JSON.stringify(response.body),/PRIVATE|SQL|JWT|PGRST/)
  }
})

test('global public identity does not call sporting models or fabricate metrics; invalid section remains 400',async()=>{
  const identity={userId:'global',name:'Jugador sin club',contexts:[]}
  const handler=compile('../app/api/players/[playerId]/career/route.ts',{'next/server':nextResponse,
    '@/features/player-career/player-career.repository':{readCareerIdentity:async()=>identity,readCareerSummary:()=>{throw Error('SPORTS_CALLED')},readCareerHistory:()=>{throw Error('SPORTS_CALLED')}},
    '@/features/player-career/player-career.rules':{pageNumber:()=>1}})
  for(const section of ['summary','history','recent']) {
    const response=await handler.GET(new Request('http://localhost/api/players/global/career?section='+section),{params:Promise.resolve({playerId:'global'})})
    assert.equal(response.status,200);assert.equal(response.body.context,'GLOBAL_WITHOUT_CLUB');assert.equal(response.body.summary,null)
    assert.equal(response.body.rows.length,0);assert.doesNotMatch(JSON.stringify(response.body),/ranking_points|ranking_position|email|phone/)
  }
  assert.equal((await handler.GET(new Request('http://localhost/api/players/global/career?section=invalid'),{params:Promise.resolve({playerId:'global'})})).status,400)
})
test('gender navigation resets page/division but keeps club, season, category and query',()=>{
  const url=new URL(rules.rankingHref({clubId:'club',season:'season',division:'MINDIVIDUAL6',category:'6',page:'9',q:'Ana'},{division:undefined,page:undefined,gender:'F'}),'http://localhost')
  assert.equal(url.searchParams.get('gender'),'F');assert.equal(url.searchParams.has('division'),false);assert.equal(url.searchParams.has('page'),false)
  for(const [key,value] of [['clubId','club'],['season','season'],['category','6'],['q','Ana']])assert.equal(url.searchParams.get(key),value)
})
test('missing models are distinct from transport errors and from empty results',()=>{
  for(const code of ['PGRST205','PGRST202','42P01','42883'])assert.equal(rules.rankingReadIssue({code}),'MODEL_UNAVAILABLE')
  assert.equal(rules.rankingReadIssue({code:'PGRST000'}),'READ_UNAVAILABLE')
  assert.equal(rules.rankingReadIssue(new Error('PRIVATE INTERNAL DIAGNOSTIC')),'READ_UNAVAILABLE')
})

async function route(reads,params={clubId:'00000000-0000-4000-8000-000000000001',gender:'M',modality:'INDIVIDUAL',category:'6',season:'season',division:'MINDIVIDUAL6'}) {
  const club={id:params.clubId,name:'Club',logo_url:null,theme_key:null}
  const scope={...context(),clubId:club.id}
  const repo={readPublicClub:async()=>({clubs:[club],count:1}),readRankingDirectory:async()=>({clubs:[club],count:1}),
    readRankingContexts:async()=>[scope],readPublicRankingSeasons:async()=>[],readPublishedRankingContexts:async contexts=>contexts.map(c=>({...c,rankedCount:0})),readRankingPage:async()=>({rows:[],count:0,page:1,pageSize:25,context:scope}),
    readPairRankingPage:async()=>({rows:[],count:0}),readRankingPresentation:async()=>({counts:{M:0,F:0},leaderPoints:null}),...reads}
  const rankingView=()=>null
  const page=compile('../app/ranking/page.tsx',{
    '@/components/public/PublicRankingExperience':{default:rankingView},'@/features/player-career/player-career.repository':repo,
    '@/features/preview-sports-demo/demo-data':{sportsDemoEnabled:()=>false},
    '@/components/public/PreviewSportsNotice':{default:()=>null},
    '@/features/player-career/player-career.rules':{pageNumber:s=>Number(s)||1,validId:s=>Boolean(s?.startsWith('00000000'))},
    '@/features/player-career/public-ranking.presentation':rules,'next/navigation':{redirect:href=>{throw new Error('REDIRECT '+href)}}
  })
  const rendered=await page.default({searchParams:Promise.resolve(params)})
  const ranking=rendered.props.children[1]
  assert.equal(ranking.type,rankingView)
  return ranking.props
}
test('actual page catches missing read model while retaining club/season/context',async()=>{
  const result=await route({readRankingPage:async()=>{throw Object.assign(new Error('private'),{code:'PGRST205'})}})
  assert.equal(result.error,'MODEL_UNAVAILABLE');assert.equal(result.ranking.context.seasonId,'season');assert.equal(result.clubs[0].name,'Club')
})
test('actual page isolates context and directory failures instead of producing a Next 500',async()=>{
  const contextFailure=await route({readRankingContexts:async()=>{throw new Error('network')}})
  assert.equal(contextFailure.error,'READ_UNAVAILABLE');assert.equal(contextFailure.clubs[0].name,'Club')
  const directoryFailure=await route({readRankingDirectory:async()=>{throw new Error('network')}},{})
  assert.equal(directoryFailure.error,'READ_UNAVAILABLE');assert.equal(directoryFailure.clubs.length,0)
})
test('actual page treats a successful zero-row read as empty, not unavailable',async()=>{
  const result=await route({});assert.equal(result.error,null);assert.equal(result.total,0)
})
test('null-category PAIRS canonical URLs do not enter an empty-query redirect loop',async()=>{
  const pair=context('M','PAIRS',null);pair.clubId='00000000-0000-4000-8000-000000000001'
  const result=await route({readRankingContexts:async()=>[pair]},{clubId:pair.clubId,gender:'M',modality:'PAIRS',season:'season',division:'MPAIRSnull'})
  assert.equal(result.error,null);assert.equal(result.params.category,undefined)
})
test('errors have retry, contextual copy and no fake leaderboard/pagination; avatar failures use initials',()=>{
  const ui=source('../components/public/PublicRankingExperience.tsx')
  assert.match(ui,/RankingRetryButton/);assert.match(ui,/data-ranking-state="error"/);assert.match(ui,/data-ranking-state="empty"/)
  assert.match(ui,/!error && context/);assert.doesNotMatch(ui,/Ranking pendiente de lectura|No mostramos puntos legacy|club_players\.ranking_points/)
  const avatar=source('../components/ranking/RankingPlayerAvatar.tsx');assert.match(avatar,/onError/);assert.match(avatar,/getClubInitials\(name\)/)
  const css=source('../components/public/PublicRankingExperience.module.css');assert.doesNotMatch(css,/overflow-x:\s*hidden/);assert.match(css,/@media\(max-width:430px\).*padding-inline:0/)
})
