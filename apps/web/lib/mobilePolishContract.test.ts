import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import { careerPerformance } from '../features/player-career/career-performance.presentation'
import type { CareerStats } from '../features/player-career/player-career.types'

const stats: CareerStats = { tournaments_played:4, matches_played:12, wins:9, losses:3, effectiveness:75, titles:2, finals:3, semifinals:1 }
test('unavailable or absent sports readings never acquire placeholder numbers',()=>{
  assert.equal(careerPerformance(stats,false),null)
  assert.equal(careerPerformance(null,true),null)
  assert.equal(careerPerformance(undefined,true),null)
})
test('performance uses official numbers and rate, without recomputing sporting rules',()=>{
  const view=careerPerformance({...stats,effectiveness:63.5},true)!
  assert.equal(view.played,12);assert.equal(view.wins,9);assert.equal(view.losses,3)
  assert.equal(view.effectiveness,63.5);assert.equal(view.winShare,75)
})
test('verified zero matches remain zero and do not invent a win rate or chart',()=>{
  const view=careerPerformance({...stats,matches_played:0,wins:0,losses:0,effectiveness:null},true)!
  assert.equal(view.played,0);assert.equal(view.wins,0);assert.equal(view.effectiveness,null);assert.equal(view.winShare,null)
})
test('invalid counts and incoherent totals cannot produce a misleading chart',()=>{
  for(const count of [-1,NaN,Infinity,1.5]) assert.equal(careerPerformance({...stats,wins:count},true),null)
  assert.equal(careerPerformance({...stats,wins:8},true)?.winShare,null)
  assert.equal(careerPerformance({...stats,effectiveness:101},true)?.effectiveness,null)
})

const require=createRequire(import.meta.url)
function component(file='CareerPerformance.tsx',extraImports:Record<string,unknown>={}){
  const ts=require('typescript'),compiledModule={exports:{} as {default:unknown}}
  const imports:Record<string,unknown>={
    '@/features/player-career/career-performance.presentation':{careerPerformance},
    './CareerExperience.module.css':new Proxy({},{get:(_target,key)=>String(key)}),
    ...extraImports,
  }
  const source=readFileSync(new URL('../components/player/'+file,import.meta.url),'utf8')
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,require:(name:string)=>name in imports?imports[name]:require(name)})
  return compiledModule.exports.default
}
test('rendered empty performance is useful but never exposes unverified metrics',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Performance=component()
  const html=renderToStaticMarkup(React.createElement(Performance,{stats:{...stats,matches_played:12345},available:false}))
  assert.match(html,/resultados verificados/);assert.doesNotMatch(html,/12345|75%|balanceTrack/)
  assert.equal((html.match(/<dd>—<\/dd>/g)||[]).length,4)
})
test('rendered balance has an accessible textual equivalent and no invented evolution',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),Performance=component()
  const html=renderToStaticMarkup(React.createElement(Performance,{stats,available:true}))
  assert.match(html,/9 partidos ganados y 3 perdidos/);assert.match(html,/width:75%/)
  assert.doesNotMatch(html,/Evolución|Sets ganados|Mejor posición/)
})
test('compact header actions are opt-in and preserve semantic reading order',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
  const Header=component('../navigation/PageHeader.tsx',{
    './PageBackAction':{default:()=>null},
    './PageHeader.module.css':{default:new Proxy({},{get:(_target,key)=>String(key)})},
  })
  const props={title:'Mensajes',description:'Descripción completa',actions:React.createElement('button',null,'Nuevo mensaje')}
  const established=renderToStaticMarkup(React.createElement(Header,props))
  const compact=renderToStaticMarkup(React.createElement(Header,{...props,compactActions:true}))
  assert.doesNotMatch(established,/hasActions/);assert.match(compact,/hasActions/)
  assert.ok(compact.indexOf('Descripción completa')<compact.indexOf('Nuevo mensaje'))
})

test('player profile exposes real own editing entries while public actions remain read-only',()=>{
  const hero=readFileSync('components/player/CareerIdentityHero.tsx','utf8')
  assert.match(hero,/own \? <Link className=\{styles\.coverEdit\}/)
  assert.match(hero,/profileEditorHref\(editorHref,'cover'\)/);assert.match(hero,/profileEditorHref\(editorHref,'avatar'\)/);assert.match(hero,/completar-perfil\?edit=sports/)
  assert.match(hero,/Editar perfil/);assert.match(hero,/Datos deportivos/)
  assert.match(hero,/Ver carrera/);assert.match(hero,/Ver club/);assert.match(hero,/Compartir perfil/)
  assert.doesNotMatch(hero,/Facebook/)
})

test('PLAYER bottom navigation replaces messages with a personal avatar profile entry',()=>{
  const nav=readFileSync('components/navigation/MobileBottomNav.tsx','utf8')
  const model=readFileSync('lib/mobileNavigation.ts','utf8')
  assert.match(nav,/profileAvatarUrl/);assert.match(nav,/styles\.profileIcon/)
  assert.match(model,/label: 'Perfil', href: '\/perfil', icon: 'profile'/)
  const playerBlock=model.slice(model.indexOf("if (role === 'player')"),model.indexOf("const icons:"))
  assert.doesNotMatch(playerBlock,/label: 'Mensajes'/)
})
