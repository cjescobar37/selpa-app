import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const { PWA_OPENING, PWA_OPENING_BOOTSTRAP } = await import(new URL('./pwaOpening.ts', import.meta.url).href) as typeof import('./pwaOpening')
function boot({ width = 390, installed = true, reduced = false, painted = false, path = '/', ua = 'iPhone Mobile Safari', navigation = 'navigate' } = {}) {
  const styles: { textContent: string; id: string; remove: () => void }[] = [], timers: { callback: () => void; ms: number }[] = []
  const window = {} as { __selpaOpening?: { active: boolean; finish: () => void }; addEventListener: () => void; removeEventListener: () => void }
  window.addEventListener = () => {}; window.removeEventListener = () => {}
  runInNewContext(PWA_OPENING_BOOTSTRAP, {
    window, location: { pathname: path }, navigator: { userAgent: ua },
    matchMedia: (q: string) => ({ matches: q.includes('reduced') ? reduced : q.includes('display-mode') ? installed : width < 601, addEventListener() {}, removeEventListener() {} }),
    performance: { now: () => 50, getEntriesByName: () => painted ? [{}] : [], getEntriesByType: () => [{ type: navigation }] },
    document: { visibilityState: 'visible', createElement: () => ({ textContent: '', id: '', remove() { styles.splice(styles.indexOf(this), 1) } }), head: { append: (s: typeof styles[number]) => styles.push(s) }, addEventListener() {}, removeEventListener() {}, getElementById: () => styles[0] },
    setTimeout: (callback: () => void, ms: number) => { timers.push({ callback, ms }); return 1 }, clearTimeout() {},
  })
  return { window, styles, timers }
}
test('prepaint activation is omitted after content paint, outside phone PWA homes, or with reduced motion', () => {
  for (const options of [{ painted: true }, { width: 1280 }, { installed: false }, { reduced: true }, { path: '/player/pagos' }, { ua: 'iPad Tablet' }, { navigation: 'back_forward' }]) {
    const result = boot(options); assert.equal(result.styles.length, 0); assert.equal(result.window.__selpaOpening, undefined)
  }
})
test('early activation starts opaque, expires without hydration and cannot be reactivated by finish', () => {
  const result = boot(); assert.equal(result.styles.length, 1); assert.equal(result.window.__selpaOpening?.active, true)
  assert.match(result.styles[0].textContent, /display:grid!important/); assert.match(result.styles[0].textContent, /#061b3a/)
  assert.equal(result.timers[0].ms, PWA_OPENING.maxMs); result.timers[0].callback()
  assert.equal(result.window.__selpaOpening?.active, false); assert.equal(result.styles.length, 0)
  result.window.__selpaOpening?.finish(); assert.equal(result.styles.length, 0)
})
test('native/web first frames share original artwork and geometry; parser script precedes the body', () => {
  const source = (p: string) => readFileSync(p, 'utf8'), layout = source('app/layout.tsx')
  assert.ok(layout.indexOf('selpa-opening-bootstrap') < layout.indexOf('<body>'))
  assert.ok(layout.indexOf('<PwaOpening') < layout.indexOf('<AppShellClient'))
  assert.match(source('app/pwa/startup/[screen]/route.tsx'), /getPwaOpeningArtwork/)
  assert.match(source('components/pwa/PwaOpening.tsx'), /PWA_OPENING\.medallion/)
  assert.doesNotMatch(source('components/pwa/PwaOpening.tsx'), /hidden = false|\.decode\(|new window.Image/)
  assert.deepEqual(readFileSync('app/icon.png'), readFileSync('app/apple-icon.png'))
})
