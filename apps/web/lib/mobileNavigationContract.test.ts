import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { getMobileNavigation, isMobileKeyboardOpen, mobileActiveHref, showMobileNavigation } from './mobileNavigation'
import { rankingBranchHref } from '../features/player-career/public-ranking.presentation'

test('four destinations per full role are existing canonical routes, never placeholders', () => {
  const expected = {
    guest: ['/', '/torneos', '/ranking', '/clubes'],
    player: ['/player', '/player/torneos', '/player/ranking', '/player/mensajes'],
    club: ['/club', '/club/competition', '/club/jugadores', '/club/admin'],
    platform: ['/platform/solicitudes', '/platform/facturacion', '/platform/noticias', '/platform/analytics'],
  }
  for (const role of ['guest','player','club','platform'] as const) {
    const items = getMobileNavigation(role,'OWNER')
    assert.deepEqual(items.map(item=>item.href),expected[role])
    for (const item of items) {
      const path = item.href === '/' ? '' : item.href
      assert.ok(['app','app/(app)'].some(root=>existsSync(`${root}${path}/page.tsx`)),item.href)
    }
  }
})

test('club navigation filters every destination by existing capabilities and approved context', () => {
  assert.deepEqual(getMobileNavigation('club','OWNER',false),[])
  for (const role of [null,'INVALID','PLAYER']) assert.deepEqual(getMobileNavigation('club',role),[])
  assert.deepEqual(getMobileNavigation('club','PLANILLERO').map(item=>item.href),['/club','/club/competition'])
  assert.ok(!getMobileNavigation('player').some(item=>item.href.startsWith('/club/')))
})

test('active destination includes child routes, sporting details and canonical public aliases', () => {
  for (const [role,path,href] of [
    ['guest','/torneos/abc','/torneos'],['guest','/jugadores/abc','/ranking'],['guest','/clubs/abc','/clubes'],
    ['player','/player/torneos/calendario','/player/torneos'],['player','/ranking?clubId=abc','/player/ranking'],['player','/player/mensajes/abc','/player/mensajes'],
    ['player','/ajustes','/player'],['club','/club/torneos/abc','/club/competition'],['club','/club/jugadores/abc','/club/jugadores'],['club','/club/finanzas','/club/admin'],
    ['platform','/platform/usuarios','/platform/solicitudes'],['platform','/platform/publicidad','/platform/noticias'],['platform','/platform','/platform/solicitudes'],
  ] as const) assert.equal(mobileActiveHref(getMobileNavigation(role,'OWNER'),path),href,path)
  assert.equal(mobileActiveHref(getMobileNavigation('guest'),'/noticias'),undefined)
  assert.equal(mobileActiveHref(getMobileNavigation('guest'),'/ranking-falso'),undefined)
})

test('authentication, inscription and immersive editors retain their own actions without a fixed nav', () => {
  for (const route of ['/login','/register','/reset-password','/update-password','/completar-perfil','/torneos/id/inscripcion','/club/torneos/nuevo','/club/torneos/crear','/club/torneos/id/editar','/club/partidos/planillero','/checkout']) assert.equal(showMobileNavigation(route),false,route)
  for (const route of ['/','/player','/player/pagos','/club/competition','/platform/analytics']) assert.equal(showMobileNavigation(route),true,route)
})

test('virtual keyboard hiding does not mistake focus, browser chrome or pinch zoom for typing', () => {
  assert.equal(isMobileKeyboardOpen(844,510,1,true),true)
  assert.equal(isMobileKeyboardOpen(844,510,1,false),false)
  assert.equal(isMobileKeyboardOpen(844,760,1,true),false)
  assert.equal(isMobileKeyboardOpen(844,430,2,true),false)
  assert.equal(isMobileKeyboardOpen(390,390,1,true),false)
})

test('branch changes preserve club, season, category and modality but discard incompatible division and pagination', () => {
  const params={clubId:'club',season:'season',category:'6',division:'male-division',modality:'PAIRS',gender:'M',page:'3'}
  const result=new URL(rankingBranchHref(params,'F',7),'https://local.invalid')
  assert.equal(result.searchParams.get('clubId'),'club');assert.equal(result.searchParams.get('season'),'season')
  assert.equal(result.searchParams.get('category'),'6');assert.equal(result.searchParams.get('modality'),'PAIRS')
  assert.equal(result.searchParams.get('gender'),'F');assert.equal(result.searchParams.has('division'),false);assert.equal(result.searchParams.has('page'),false)
  assert.equal(new URL(rankingBranchHref({demo:'1'},'M',6),'https://local.invalid').pathname,'/preview/demo')
  assert.equal(new URL(rankingBranchHref({},'F',6),'https://local.invalid').searchParams.get('category'),'6')
})

test('one session provider and persistent installation host preserve PLAYER and standalone protections', () => {
  const shell=readFileSync('components/AppShellClient.tsx','utf8')
  assert.equal((shell.match(/<SessionProvider>/g)||[]).length,1)
  assert.equal((shell.match(/<MobileBottomNav /g)||[]).length,1)
  assert.equal((shell.match(/<HomeInstallHost /g)||[]).length,1)
  const player=readFileSync('app/(app)/player/page.tsx','utf8')
  assert.match(player,/selpa\.player\.homeMode/);assert.match(player,/ModeSegmentedControl/)
  const css=readFileSync('components/navigation/MobileNavigation.module.css','utf8')
  assert.match(css,/env\(safe-area-inset-bottom/)
  const height=Number(css.match(/--selpa-bottom-nav-height:(\d+)px/)?.[1])
  assert.ok(height>=58 && height<=64,'compact navigation retains the approved height range')
  assert.match(css,/prefers-reduced-motion/);assert.doesNotMatch(css,/!important/)
})

test('canonical page headers opt out of legacy viewport-width rules; cards and desktop have separate scopes', () => {
  const header=readFileSync('components/navigation/PageHeader.tsx','utf8'),css=readFileSync('components/navigation/PageHeader.module.css','utf8')
  assert.match(header,/data-selpa-page-header/);assert.match(css,/--selpa-page-header-bg/)
  assert.match(css,/\.mobileCanonical\.fullBleed/);assert.doesNotMatch(css,/!important/)
  for(const file of ['app/styles/navbar.css','app/styles/public.css']){
    const styles=readFileSync(file,'utf8')
    for(const name of ['publicTournamentHero','publicClubsHero','px-publicNewsHero']){
      const selectors=styles.match(new RegExp('\\.'+name+'[^,{\\n]*','g'))??[]
      for(const selector of selectors) assert.ok(selector.includes(':not([data-selpa-page-header])'),selector)
    }
  }
  for(const file of ['components/public/PublicTournamentsExperience.tsx','components/public/PublicNewsExperience.tsx','app/clubes/page.tsx']) assert.match(readFileSync(file,'utf8'),/<PageHeader/)
})
