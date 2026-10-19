import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const { PWA_OPENING, PWA_OPENING_BOOTSTRAP } = await import(new URL('./pwaOpening.ts', import.meta.url).href) as typeof import('./pwaOpening')
function boot({ width = 390, reduced = false, painted = false, body = false, path = '/', ua = 'iPhone Mobile Safari', navigation = 'navigate', ready = true, layer = true } = {}) {
  let now = 50, id = 0, homeReady = ready, layerPresent = layer
  const styles: { textContent: string; id: string; remove: () => void }[] = []
  const frames = new Map<number, (at: number) => void>(), timers = new Map<number, { callback: () => void; at: number }>()
  const listeners = new Map<string, () => void>()
  const window = {} as { __selpaOpening?: { active: boolean; shownAt: number; leavingAt: number; finish: () => void }; addEventListener: () => void; removeEventListener: () => void }
  window.addEventListener = () => {}; window.removeEventListener = () => {}
  const document = {
    body: body ? {} : null, readyState: 'loading', visibilityState: 'visible', fonts: { status: 'loaded' },
    createElement: () => ({ textContent: '', id: '', remove() { styles.splice(styles.indexOf(this), 1) } }),
    head: { append: (s: typeof styles[number]) => styles.push(s) },
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name),
    getElementById: () => styles[0], querySelectorAll: () => [],
    querySelector: (selector: string) => selector === '[data-pwa-opening]' ? { getClientRects: () => styles.length && layerPresent ? [{}] : [] }
      : selector === '.px-nav' ? { getBoundingClientRect: () => ({ height: 56 }) }
      : { matches: () => false, querySelector: (query: string) => query === 'h1' && homeReady ? { getBoundingClientRect: () => ({ x: 8, y: 70, width: 374, height: 40 }) } : null },
  }
  runInNewContext(PWA_OPENING_BOOTSTRAP, {
    window, document, location: { pathname: path }, navigator: { userAgent: ua },
    matchMedia: (q: string) => ({ matches: q.includes('reduced') ? reduced : width < 601, addEventListener() {}, removeEventListener() {} }),
    performance: { now: () => now, getEntriesByName: () => painted ? [{}] : [], getEntriesByType: () => [{ type: navigation }] },
    requestAnimationFrame: (callback: (at: number) => void) => { frames.set(++id, callback); return id }, cancelAnimationFrame: (key: number) => frames.delete(key),
    setTimeout: (callback: () => void, ms: number) => { timers.set(++id, { callback, at: now + ms }); return id }, clearTimeout: (key: number) => timers.delete(key),
  })
  document.readyState = 'complete'
  function advance(ms: number) {
    const end = now + ms
    while (now < end) {
      now += Math.min(16, end - now)
      const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(now)
      for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.callback() }
    }
  }
  return { window, document, styles, advance, listeners, setReady: (value: boolean) => { homeReady = value }, setLayer: () => { layerPresent = true } }
}
test('prepaint is phone/home only; late, desktop, tablet, reduced motion and history restore are omitted', () => {
  for (const options of [{ painted: true }, { body: true }, { width: 1280 }, { reduced: true }, { path: '/player/pagos' }, { ua: 'iPad Tablet' }, { navigation: 'back_forward' }]) {
    const result = boot(options); assert.equal(result.styles.length, 0); assert.equal(result.window.__selpaOpening, undefined)
  }
})
test('a ready home crossfades after stable frames, without an artificial brand hold; exit is one-way', () => {
  const result = boot(); assert.equal(result.styles.length, 1); assert.equal(result.window.__selpaOpening?.active, true)
  assert.match(result.styles[0].textContent, /opacity:1;transition:opacity 260ms/)
  assert.match(result.styles[0].textContent, /\.app-shell\{opacity:0;transition:opacity 260ms/)
  result.advance(60); assert.ok(result.window.__selpaOpening!.leavingAt > 0)
  assert.match(result.styles[0].textContent, /\[data-pwa-opening\]\{opacity:0\}/)
  assert.match(result.styles[0].textContent, /\.app-shell\{opacity:1\}/)
  result.advance(260); assert.equal(result.window.__selpaOpening?.active, false); assert.equal(result.styles.length, 0)
  result.window.__selpaOpening?.finish(); result.advance(2000); assert.equal(result.styles.length, 0)
  assert.equal(PWA_OPENING.exitMs, 260)
  assert.doesNotMatch(PWA_OPENING_BOOTSTRAP, /now - state.shownAt >=/)
})

test('navy canvas precedes the streamed body; original home background returns under the opaque layer', () => {
  const result = boot({ ready: false, layer: false })
  assert.match(result.styles[0].textContent, /html\{background:#061b3a/)
  assert.match(result.styles[0].textContent, /body\{background:#061b3a/)
  result.advance(300); assert.match(result.styles[0].textContent, /body\{background:/)
  result.setLayer(); result.advance(20)
  assert.doesNotMatch(result.styles[0].textContent, /body\{background:/)
  assert.match(result.styles[0].textContent, /\[data-pwa-opening\].*opacity:1/)
  result.listeners.get('pointerdown')!(); assert.equal(result.styles.length, 0)
})
test('slow home/fonts stay opaque instead of a timer revealing the loader, then fade only when ready', () => {
  const result = boot({ ready: false }); result.advance(3000)
  assert.equal(result.window.__selpaOpening?.active, true); assert.equal(result.window.__selpaOpening?.leavingAt, 0)
  result.setReady(true); result.document.fonts.status = 'loading'; result.advance(500); assert.equal(result.window.__selpaOpening?.leavingAt, 0)
  result.document.fonts.status = 'loaded'; result.advance(60); assert.ok(result.window.__selpaOpening!.leavingAt > 0)
  result.advance(260); assert.equal(result.styles.length, 0)
})
test('interaction immediately retires the layer without cancelling the original gesture', () => {
  for (const name of ['pointerdown', 'keydown', 'focusin', 'wheel', 'touchmove']) {
    const result = boot({ ready: false }); result.advance(20); result.listeners.get(name)!()
    assert.equal(result.window.__selpaOpening?.active, false); assert.equal(result.styles.length, 0)
  }
})
test('native/web use original artwork; SSR markup is never mutated and motion has no independent hard cut', () => {
  const source = (p: string) => readFileSync(p, 'utf8'), layout = source('app/layout.tsx'), component = source('components/pwa/PwaOpening.tsx'), css = source('components/pwa/PwaOpening.module.css')
  assert.ok(layout.indexOf('selpa-opening-bootstrap') < layout.indexOf('<body>'))
  assert.ok(layout.indexOf('<PwaOpening') < layout.indexOf('<AppShellClient'))
  assert.match(source('app/pwa/startup/[screen]/route.tsx'), /getPwaOpeningArtwork/)
  assert.match(component, /PWA_OPENING\.medallion/)
  assert.doesNotMatch(component, /useEffect|useState|hidden =|\.decode\(|new window.Image/)
  assert.doesNotMatch(PWA_OPENING_BOOTSTRAP, /dataset|\.hidden|preventDefault|setTimeout\(finish, 1000/)
  for (const effect of ['breathing', 'halo', 'orbit', 'sweep', 'wordmark-in']) assert.match(css, new RegExp('@keyframes ' + effect))
  assert.doesNotMatch(css, /opening-limit|surface-out/)
  for (const effect of ['breathing', 'halo', 'orbit', 'sweep']) assert.match(css, new RegExp('animation: ' + effect + '[^;]+infinite'))
  assert.match(source('app/page.tsx'), /<Suspense fallback=.*<PublicHomeContent/)
  assert.match(source('app/page.tsx'), /: <PublicHomeContent \/>/)
  assert.match(source('app/page.tsx'), /!\/iPad\|Tablet\/i.test\(ua\)/)
  assert.deepEqual(readFileSync('app/icon.png'), readFileSync('app/apple-icon.png'))
})
