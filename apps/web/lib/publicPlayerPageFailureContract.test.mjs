import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
const source=readFileSync(new URL('../app/jugadores/[id]/page.tsx',import.meta.url),'utf8')
function page(read,preview=false){const compiledModule={exports:{}},Career=()=>null,State=()=>null
  const imports={'react':{cache:f=>f},'next/navigation':{notFound:()=>{throw new Error('NOT_FOUND')}},'@/components/player/CareerExperience':{default:Career},'@/components/player/PlayerStatePanel':{default:State},'@/features/preview-sports-demo/demo-data':{sportsDemoEnabled:()=>preview},'@/features/player-career/player-career.repository':{readCareerIdentity:read}}
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,require:n=>n in imports?imports[n]:require(n)});return {...compiledModule.exports,Career,State}
}
const props={params:Promise.resolve({id:'player'}),searchParams:Promise.resolve({clubId:'club'})}
for(const preview of [false,true])test('unavailable read stays closed and renders controlled state; preview='+preview,async()=>{
  const p=page(async()=>{throw Object.assign(new Error('PRIVATE INTERNAL MESSAGE'),{code:'PGRST205'})},preview),result=await p.default(props)
  assert.equal(result.type,p.State);assert.equal(result.props.kind,'error');assert.equal(result.props.title,'Perfil deportivo no disponible');assert.equal(result.props.action.href,preview?'/preview/demo?view=profile':'/ranking');assert.doesNotMatch(JSON.stringify(result.props),/PRIVATE INTERNAL|ranking_points|email|phone/)
})
test('unknown/private identity remains notFound, not fabricated empty profile',async()=>{await assert.rejects(page(async()=>null).default(props),/NOT_FOUND/)})
test('authorized public identity still uses the approved career component',async()=>{const identity={name:'Visible',contexts:[],selectedClubPlayerId:'p'},p=page(async()=>identity),result=await p.default(props);assert.equal(result.type,p.Career);assert.equal(result.props.identity,identity)})
test('failed metadata read has safe noindex title, no diagnostic leak',async()=>{const p=page(async()=>{throw new Error('PRIVATE INTERNAL')});const meta=await p.generateMetadata(props);assert.equal(meta.robots.index,false);assert.equal(meta.title,'Perfil deportivo no disponible · SELPA');assert.doesNotMatch(JSON.stringify(meta),/PRIVATE INTERNAL/)})
