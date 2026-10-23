import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { PWA_COLORS, PWA_STARTUP_SCREENS } = await import(new URL('./pwa.ts', import.meta.url).href) as typeof import('./pwa')
const source = (path: string) => readFileSync(path, 'utf8')

test('installation reuses SELPA colors and exact original Apple artwork', () => {
  assert.deepEqual(PWA_COLORS, { theme: '#313b4c', background: '#061b3a' })
  assert.match(source('app/manifest.ts'), /background_color: PWA_COLORS.background/)
  assert.match(source('app/styles/base.css'), /--bg: #f4f7fb/)
  const original = readFileSync('app/icon.png'), apple = readFileSync('app/apple-icon.png')
  assert.equal(original.readUInt32BE(16), 512)
  assert.equal(original.readUInt32BE(20), 512)
  assert.deepEqual(apple, original)
})

test('native startup assets have unique bounded portrait/landscape dimensions', () => {
  assert.equal(new Set(PWA_STARTUP_SCREENS.map(screen => screen.id)).size, 22)
  for (const screen of PWA_STARTUP_SCREENS) {
    assert.ok(screen.pixelWidth > 0 && screen.pixelWidth < 4096)
    assert.ok(screen.pixelHeight > 0 && screen.pixelHeight < 4096)
    assert.match(screen.media, /device-width:/)
    assert.match(screen.media, /-webkit-device-pixel-ratio:/)
    assert.match(screen.media, new RegExp(`orientation: ${screen.orientation}`))
    assert.equal(screen.pixelWidth * screen.pixelHeight, screen.width * screen.height * screen.scale ** 2)
  }
  assert.match(source('app/pwa/startup/[screen]/route.tsx'), /dynamicParams = false/)
})

test('PWA metadata does not add token transfers, runtime caches or an artificial splash', () => {
  const installation = ['app/manifest.ts', 'app/pwa/icon-192/route.tsx', 'app/pwa/startup/[screen]/route.tsx', 'lib/pwa.ts'].map(source).join('\n')
  assert.doesNotMatch(installation, /serviceWorker\.register|caches\.(?:open|put|match)|localStorage|sessionStorage|access_token|refresh_token|setTimeout|fetch\(/)
  assert.match(source('app/manifest.ts'), /start_url: '\/'/)
  assert.match(source('app/manifest.ts'), /display: 'standalone'/)
})

test('safe top belongs to header, not a second accumulated mobile-bar inset', () => {
  assert.match(source('app/pwa.css'), /\.app-shell > \.px-nav \{[^}]*padding-top: var\(--selpa-safe-top\)/)
  assert.doesNotMatch(source('app/styles/navbar.css'), /padding: calc\(7px \+ env\(safe-area-inset-top/)
  assert.match(source('app/layout.tsx'), /viewportFit: 'cover'/)
  assert.doesNotMatch(source('app/layout.tsx'), /userScalable: false|maximumScale: 1/)
})

test('existing SDK persistence and server-derived active club/role remain the authority', () => {
  const client = source('lib/supabaseClient.ts'), provider = source('components/session/SessionProvider.tsx')
  assert.match(client, /persistSession: true/); assert.match(client, /autoRefreshToken: true/)
  assert.match(provider, /from\('user_settings'\)\.select\('active_club_id'\)/)
  assert.match(provider, /from\('club_memberships'\)\.select\('club_id,role,status,approved_at'\)/)
  assert.match(provider, /onAuthStateChange/)
  assert.match(provider, /event === 'SIGNED_OUT'[\s\S]*clearSessionContext\(\)/)
})

test('installed iOS navbar uses solid paint and keeps its accent visible below the status region', () => {
  const layout = source('app/layout.tsx')
  const shell = source('components/AppShellClient.tsx')
  const css = source('app/pwa.css')
  assert.doesNotMatch(layout, /statusBarStyle:\s*['"]black-translucent['"]/)
  assert.doesNotMatch(shell, /pwa-ios-status-sampler/)
  assert.doesNotMatch(css, /pwa-ios-status-sampler/)
  assert.match(css, /\.app-shell > \.px-nav::before\s*\{\s*top:\s*auto;\s*bottom:\s*0/)
  assert.match(css, /background:\s*#313b4c/)
  assert.match(css, /-webkit-backdrop-filter:\s*none/)
  assert.match(css, /height:\s*3px/)
})

test('iOS launch PNGs contain no static SELPA logo: animation owns first branded frame', () => {
  const startup = source('app/pwa/startup/[screen]/route.tsx')
  const layout = source('app/layout.tsx')
  const opening = source('lib/pwaOpening.ts')
  const openingCss = source('components/pwa/PwaOpening.module.css')
  assert.match(startup, /backgroundImage: PWA_OPENING\.backgroundImage/)
  assert.doesNotMatch(startup, /getPwaOpeningArtwork|artwork\.(symbol|wordmark)|<img|PWA_OPENING\.medallion/)
  assert.match(layout, /startupImage: PWA_STARTUP_SCREENS/)
  assert.match(opening, /version: 'navy-animation-only-v3'/)
  assert.match(openingCss, /@keyframes medallion-in \{ from \{ opacity: 0;/)
  assert.match(openingCss, /@keyframes wordmark-in \{ from \{ opacity: 0;/)
})
