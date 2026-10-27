import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {civilSportsDate,instantSportsDate,sportsDateKey,sportsDateParts} from './sportsDate'
import {profileEditReturn} from './profileEditNavigation'
const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('civil dates from the four reported tournament DTOs never shift with the host timezone',()=>{
  for(const date of ['2026-07-10','2026-08-15','2026-10-10','2026-10-17','2026-01-01','2026-12-31','2024-02-29']){
    assert.equal(civilSportsDate(date),date);assert.equal(sportsDateKey(date),date)
    assert.equal(sportsDateParts(date)?.day,String(Number(date.slice(-2))))
  }
  for(const bad of ['2026-02-29','2026-13-01','2026-04-31','invalid'])assert.equal(civilSportsDate(bad),null)
})
test('UTC/offset timestamps use Argentina and retain day/month/year boundary semantics',()=>{
  assert.equal(instantSportsDate('2026-07-10T00:00:00Z'),'2026-07-09')
  assert.equal(instantSportsDate('2026-07-10T03:00:00Z'),'2026-07-10')
  assert.equal(instantSportsDate('2026-01-01T01:00:00Z'),'2025-12-31')
  assert.equal(instantSportsDate('2026-03-01T01:00:00Z'),'2026-02-28')
  assert.equal(instantSportsDate('2024-03-01T01:00:00Z'),'2024-02-29')
  assert.equal(instantSportsDate('2026-12-31T23:30:00-03:00'),'2026-12-31')
  assert.equal(instantSportsDate('2026-07-10T01:00:00'),null)
  assert.equal(civilSportsDate('2026-07-10T00:00:00Z'),null)
})
test('profile return destinations reject external, API, authentication and recursive editor routes',()=>{
  for(const path of [null,'https://example.com','//example.com','/api/auth/signout','/login','/completar-perfil?edit=sports','/\\evil'])assert.equal(profileEditReturn(path),'/mi-cuenta')
  for(const path of ['/mi-cuenta','/mis-datos','/perfil','/player'])assert.equal(profileEditReturn(path),path)
})
test('mode framing is shared, decorative and respects reduced motion without changing the approved segments',()=>{
  const component=source('components/home/PlayerModeSurface.tsx'),css=source('components/home/PlayerModeSurface.module.css')
  assert.match(component,/aria-hidden="true"/);assert.match(component,/data-player-mode=\{mode\}/)
  assert.match(css,/pointer-events:none/);assert.match(css,/prefers-reduced-motion/)
  assert.doesNotMatch(css,/height:\s*100vh|transition:all|animation:.*infinite/)
  assert.match(source('app/(app)/player/page.tsx'),/<PlayerModeSurface mode=\{homeMode\}>/)
})
test('secondary navigation stays out of the four main tab headers and preserves partner access',()=>{
  assert.match(source('components/player/PlayerAccountCenter.tsx'),/href: '\/player#pareja-activa'/)
  for(const path of ['app/(app)/player/ranking/page.tsx','components/player/PlayerRankingProgress.tsx'])assert.doesNotMatch(source(path),/backHref=/)
})

const require=createRequire(import.meta.url)
function compile(file:string,imports:Record<string,unknown>={}){
  const ts=require('typescript'),compiledModule={exports:{} as Record<string,unknown>}
  vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:compiledModule,exports:compiledModule.exports,require:(name:string)=>name in imports?imports[name]:name.endsWith('.png')?{default:{src:'/background.png'}}:require(name)})
  return compiledModule.exports
}
test('real posters survive empty legacy rules and JSON strings; backgrounds alone are not posters',()=>{
  const helpers=compile('lib/tournamentFlyers.ts') as {getTournamentPosterUrl:(value:unknown)=>string|null;getTournamentFlyerUrl:(value:unknown)=>string|null}
  assert.equal(helpers.getTournamentPosterUrl({rules:{},rules_json:{flyer_manual_url:'/posters/one.png'}}),'/posters/one.png')
  assert.equal(helpers.getTournamentPosterUrl({rules_json:JSON.stringify({flyer_manual_url:'https://example.test/poster.jpg'})}),'https://example.test/poster.jpg')
  assert.equal(helpers.getTournamentPosterUrl({rules:{flyer_background:'fondo1'}}),null)
  assert.equal(helpers.getTournamentPosterUrl({rules:{flyer_manual_url:'javascript:alert(1)'}}),null)
  assert.equal(helpers.getTournamentFlyerUrl({rules:{flyer_background:'fondo1'}}),'/background.png')
})
test('inline save feedback is accessible and keeps technical errors out of the form',()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
  const store=compile('lib/toastStore.ts')
  const component=compile('components/ui/ActionFeedbackNotice.tsx',{'@/lib/toastStore':store,'./ActionFeedbackNotice.module.css':{default:{notice:'inline-notice'}}}).ActionFeedbackNotice
  const markup=renderToStaticMarkup(React.createElement(component,{inline:true,tone:'error',title:'No pudimos guardar',message:'PGRST202 RPC failed',onDismiss(){}}))
  assert.match(markup,/role="alert"/);assert.match(markup,/Cerrar mensaje/);assert.doesNotMatch(markup,/PGRST202|RPC failed/)
  assert.equal(renderToStaticMarkup(React.createElement(component,{tone:'success',title:'Listo',message:'Guardado',onDismiss(){}})),'')
})
test('the final user menu orders account, activity and payments before separated logout',()=>{
  const menu=source('components/navbar/AppNavbarClient.tsx').split("if (role === 'player') {")[1].split("if (role === 'club')")[0]
  const positions=['href="/mi-cuenta"','href="/actividad"','href="/player/pagos"','className="px-ddSep"','Cerrar sesión'].map(text=>menu.indexOf(text))
  assert.ok(positions.every(value=>value>=0));assert.deepEqual([...positions].sort((a,b)=>a-b),positions)
})
