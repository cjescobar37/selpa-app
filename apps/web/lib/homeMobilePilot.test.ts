import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { HOME_MOBILE_PILOT_ENABLED, isHomeMobilePilotRoute } = await import(new URL('./homeMobilePilot.ts', import.meta.url).href) as typeof import('./homeMobilePilot')
const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('pilot opts in only the two exact homes, with one local rollback switch', () => {
  assert.equal(typeof HOME_MOBILE_PILOT_ENABLED, 'boolean')
  for (const path of ['/', '/player']) assert.equal(isHomeMobilePilotRoute(path), HOME_MOBILE_PILOT_ENABLED)
  for (const path of ['/login', '/ranking', '/player/ranking', '/player/pagos', '/player/torneos', '/clubs/x', '/club', '/platform', '/player/']) assert.equal(isHomeMobilePilotRoute(path), false)
})

test('mobile CSS keeps existing typography and sporting cards; desktop is outside its media queries', () => {
  const css = source('components/home/HomeMobilePilot.module.css')
  assert.equal((css.match(/@media/g) ?? []).length, 2)
  assert.equal((css.match(/@media \(max-width: 980px\)/g) ?? []).length, 2)
  assert.doesNotMatch(css, /font-size|font-family|font-weight|letter-spacing|\.playerClubCard|\.TournamentPublicCard|\.publicRankingCard/)
  assert.match(css, /white-space: normal/)
  assert.match(css, /overflow-wrap: anywhere/)
})

test('one persistent invitation owns native capability; homes provide placement, not extra listeners', () => {
  const placement = source('components/pwa/HomeInstallPlacement.tsx')
  const invitation = source('components/pwa/PwaInstallInvitation.tsx')
  assert.equal((placement.match(/<PwaInstallInvitation/g) ?? []).length, 1)
  assert.match(invitation, /createPortal\(invitation, target\)/)
  assert.match(invitation, /useId\(\)/)
  assert.match(invitation, /aria-controls=.*guideId/)
  assert.match(source('components/public/PublicHomeExperience.tsx'), /!hideHero \? <HomeInstallSlot/)
  assert.match(source('app/(app)/player/page.tsx'), /<HomeInstallSlot \/>/)
})

test('mobile reading order is DOM order, with hydration-safe composition and full-name disclosure', () => {
  const css = source('components/home/HomeMobilePilot.module.css')
  const page = source('app/(app)/player/page.tsx')
  const viewport = source('lib/useHomeMobileLayout.ts')
  const name = source('components/home/PlayerHomeName.tsx')
  assert.doesNotMatch(css, /order:\s*-/)
  assert.match(page, /<div className="playerHomeTopControls">\{homeControls\}<\/div>/)
  assert.ok(page.indexOf('className="playerHomeTopControls"') < page.indexOf('className="playerHomeHero"'))
  assert.match(page, /!modeReady/)
  assert.match(page, /restoreModeFocus/)
  assert.match(viewport, /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/)
  assert.match(viewport, /getServerSnapshot = \(\) => false/)
  assert.match(css, /-webkit-line-clamp: 2/)
  assert.match(name, /aria-expanded=\{expanded\}/)
  assert.match(name, /Ver nombre completo/)
})
