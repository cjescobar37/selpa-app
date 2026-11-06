import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function load(file,imports={}){const compiledModule={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,URL,console,require:n=>n in imports?imports[n]:require(n)});return compiledModule.exports}
const rules=load('../features/player-career/ranking-default.rules.ts')
const display=load('../features/player-career/public-ranking.presentation.ts')
const context=(id,mode='PAIRS',gender='F',category=7,season='latest')=>({divisionId:id,clubId:'club',seasonId:season,seasonName:season,modality:mode,gender,category,categoryName:category+'ª',segmentId:mode==='PAIRS'?'libres':null,segmentName:mode==='PAIRS'?'Libres':null})
test('official Damas 7 pairs Libres wins over derived individual and older season',()=>{
 const pair=context('pair'),single=context('single','INDIVIDUAL'),old=context('old','PAIRS','M',6,'old')
 assert.equal(rules.choosePersonalRanking([old,single,pair],['pair'],['latest','old'],{category:7,gender:'F'}).divisionId,'pair')
})
test('ambiguous own divisions fall back rather than invent a group or modality',()=>{
 assert.equal(rules.choosePersonalRanking([context('a'),context('b')],['a','b'],['latest'],{category:7,gender:'F'}),null)
 assert.equal(rules.choosePersonalRanking([],[],['latest'],{category:7,gender:'F'}),null)
})
test('individual official entry and latest own available season remain valid',()=>{
 assert.equal(rules.choosePersonalRanking([context('a','INDIVIDUAL')],[],['latest'],{category:7,gender:'F'}).divisionId,'a')
 assert.equal(rules.choosePersonalRanking([context('a','PAIRS','F',7,'old')],[],['latest','old'],{category:7,gender:'F'}).seasonId,'old')
})
test('fallback selects first category even empty, Libres within it, keeps M without inventing F',()=>{
 const a=context('a','PAIRS','M',5),b={...a,divisionId:'b',segmentName:'General',rankedCount:99},c={...context('c','PAIRS','M',6),rankedCount:200}
 assert.equal(display.rankingContext([b,c,a],{},'PAIRS').divisionId,'a')
 assert.equal(display.rankingContext([context('f')],{},'INDIVIDUAL'),null)
 assert.equal(display.compactCategory(context('x')),'7ma')
 assert.equal(display.compactCategory(context('x','PAIRS','M',6)),'6ta')
 assert.equal(display.hasRankingSelection({clubId:'club'}),false)
 assert.equal(display.hasRankingSelection({category:'7'}),true)
 assert.equal(display.rankingContext([a,b],{division:'b'},'PAIRS').divisionId,'b')
})
test('default endpoint verifies identity first, validates club and ignores client user/scope',async()=>{
 const access={kind:'self',userId:'verified'},calls=[]
 class Denied extends Error{constructor(status){super();this.status=status}}
 const route=load('../app/api/player/ranking-default/route.ts',{'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status??200,headers:o.headers})}},'@/features/player-career/player-career.access':{verifySelfCareer:async()=>access,CareerAccessError:Denied},'@/features/player-career/player-career.rules':{validId:id=>id==='approved-club'},'@/features/player-career/ranking-default.repository':{readPersonalRankingDefault:async(...args)=>{calls.push(args);return null}}})
 const result=await route.GET(new Request('http://localhost/api/player/ranking-default?clubId=approved-club&userId=victim&scope=admin'))
 assert.equal(result.status,200);assert.equal(result.headers['Cache-Control'],'private, no-store');assert.deepEqual(calls,[[access,'approved-club']])
 assert.equal((await route.GET(new Request('http://localhost/api/player/ranking-default?clubId=invalid'))).status,400)
})
test('default endpoint preserves denied access and hides backend diagnostics',async()=>{
 class Denied extends Error{constructor(status){super('PRIVATE');this.status=status}}
 for(const failure of [new Denied(401),new Denied(403),new Error('PRIVATE_SQL')]){
 const route=load('../app/api/player/ranking-default/route.ts',{'next/server':{NextResponse:{json:(body,o)=>({body,status:o.status})}},'@/features/player-career/player-career.access':{verifySelfCareer:async()=>{throw failure},CareerAccessError:Denied},'@/features/player-career/player-career.rules':{},'@/features/player-career/ranking-default.repository':{}})
 const result=await route.GET(new Request('http://localhost/api/player/ranking-default'));assert.equal(result.status,failure.status??503);assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE|SQL/)
 }
})
