import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { getInstallMethod, isInstallDismissed, INSTALL_DISMISS_MS, showInstallOnRoute } = await import(new URL('./pwaInstallation.ts', import.meta.url).href) as typeof import('./pwaInstallation')
const source = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

test('native capability wins; manual instructions distinguish iOS and Android browsers', () => {
  assert.equal(getInstallMethod('unknown', '', 0, true), 'native')
  assert.equal(getInstallMethod('iPhone Version/26.0 Mobile Safari/605.1', 'iPhone', 5, false), 'ios-safari')
  assert.equal(getInstallMethod('iPhone CriOS/140 Safari/604', 'iPhone', 5, false), 'ios-browser')
  assert.equal(getInstallMethod('Macintosh Version/26 Safari/605', 'MacIntel', 5, false), 'ios-safari')
  assert.equal(getInstallMethod('Android Chrome/140 Mobile Safari/537', 'Linux', 5, false), 'android-chrome')
  assert.equal(getInstallMethod('Android Chrome/140 SamsungBrowser/28', 'Linux', 5, false), 'android-samsung')
  for (const ua of ['Linux Firefox/140', 'Android Firefox/140', 'Android; wv) Chrome/140', 'iPhone Instagram Safari/605']) assert.equal(getInstallMethod(ua, '', 0, false), null)
})

test('dismissal is bounded, expires after seven days and tolerates corrupt/future storage', () => {
  const now = 1_800_000_000_000
  assert.equal(isInstallDismissed(String(now - 1), now), true)
  for (const v of [null, '', 'broken', 'Infinity', '-1', String(now + 1), String(now - INSTALL_DISMISS_MS)]) assert.equal(isInstallDismissed(v, now), false)
})

test('invitation cannot interrupt auth, tournaments, finance or sports detail routes', () => {
  assert.equal(showInstallOnRoute('/'), true)
  assert.equal(showInstallOnRoute('/player'), true)
  for (const p of ['/login', '/register', '/torneos', '/torneos/x/inscripcion', '/player/pagos', '/ranking', '/jugadores/x', '/club']) assert.equal(showInstallOnRoute(p), false)
})

test('progressive UI preserves SSR and never intercepts native promotion or writes private data', () => {
  const component = source('components/pwa/PwaInstallInvitation.tsx')
  assert.match(component, /useState<InstallMethod>\(null\)/)
  assert.match(component, /navigator.*standalone/)
  assert.match(component, /localStorage.setItem\(INSTALL_DISMISS_KEY, String\(Date.now\(\)\)\)/)
  assert.doesNotMatch(component, /preventDefault|setTimeout|fetch\(|access_token|refresh_token|suppressHydrationWarning|serviceWorker|caches\./)
  assert.match(component, /removeEventListener\('beforeinstallprompt'/)
})

test('opening is short, reduced-motion aware, standalone/mobile only and uses original assets', () => {
  const css = source('app/pwa.css'), startup = source('app/pwa/startup/[screen]/route.tsx')
  assert.match(css, /max-width: 980px\) and \(display-mode: standalone\) and \(prefers-reduced-motion: no-preference\)/)
  assert.match(css, /animation: selpa-app-entry 160ms ease-out/)
  assert.doesNotMatch(css, /animation-delay|visibility: hidden|opacity: 0[;}]/)
  assert.match(startup, /public\/brand\/selpa-wordmark-clean-dark.png/)
  assert.match(startup, /app\/icon.png/)
})
