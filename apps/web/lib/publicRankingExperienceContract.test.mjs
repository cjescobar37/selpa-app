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
  vm.runInNewContext(js,{module:compiledModule,exports:compiledModule.exports,URLSearchParams,console:{warn(){}},require:name=>{
    if(name in imports)return imports[name]
    return require(name)
  }})
  return compiledModule.exports
}
const rules=compile('../features/player-career/public-ranking.presentation.ts')
const context=(gender='M',modality='INDIVIDUAL',category=6)=>({clubId:'club',seasonId:'season',seasonName:'2026',divisionId:gender+modality+category,category,categoryName:'6ª',gender,modality})
const contexts=[context('F'),context('M'),context('M','PAIRS')]
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
    readRankingContexts:async()=>[scope],readRankingPage:async()=>({rows:[],count:0,page:1,pageSize:25,context:scope}),
    readPairRankingPage:async()=>({rows:[],count:0}),readRankingPresentation:async()=>({counts:{M:0,F:0},leaderPoints:null}),...reads}
  const page=compile('../app/ranking/page.tsx',{
    '@/components/public/PublicRankingExperience':{default:()=>null},'@/features/player-career/player-career.repository':repo,
    '@/features/player-career/player-career.rules':{pageNumber:s=>Number(s)||1,validId:s=>Boolean(s?.startsWith('00000000'))},
    '@/features/player-career/public-ranking.presentation':rules,'next/navigation':{redirect:href=>{throw new Error('REDIRECT '+href)}}
  })
  return (await page.default({searchParams:Promise.resolve(params)})).props
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
