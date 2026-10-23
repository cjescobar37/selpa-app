import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const { PWA_OPENING, PWA_OPENING_BOOTSTRAP, PWA_OPENING_CANVAS_CSS } = await import(new URL('./pwaOpening.ts', import.meta.url).href) as typeof import('./pwaOpening')
function boot({ width = 390, reduced = false, painted = false, body = false, path = '/', ua = 'iPhone Mobile Safari', navigation = 'navigate', ready = true, layer = true } = {}) {
  let now = 50, id = 0, homeReady = ready, layerPresent = layer
  const styles: { textContent: string; id: string; remove: () => void }[] = []
  const frames = new Map<number, (at: number) => void>(), timers = new Map<number, { callback: () => void; at: number }>()
  const listeners = new Map<string, () => void>()
  const layerListeners = new Map<string, (event: { target: unknown; propertyName: string }) => void>()
  const openingLayer = {
    getClientRects: () => styles.length && layerPresent ? [{}] : [],
    addEventListener: (name: string, callback: (event: { target: unknown; propertyName: string }) => void) => layerListeners.set(name, callback),
    removeEventListener: (name: string) => layerListeners.delete(name),
  }
  const window = {} as { __selpaOpening?: { active: boolean; shownAt: number; leavingAt: number; finish: () => void }; addEventListener: () => void; removeEventListener: () => void }
  window.addEventListener = () => {}; window.removeEventListener = () => {}
  const document = {
    body: body ? {} : null, readyState: 'loading', visibilityState: 'visible', fonts: { status: 'loaded' },
    createElement: () => ({ textContent: '', id: '', remove() { styles.splice(styles.indexOf(this), 1) } }),
    head: { append: (s: typeof styles[number]) => styles.push(s) },
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name),
    getElementById: () => styles[0], querySelectorAll: () => [],
    querySelector: (selector: string) => selector === '[data-pwa-opening]' ? openingLayer
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
  return { window, document, styles, advance, listeners, layerListeners, endTransition: (propertyName = 'opacity', target: unknown = openingLayer) => layerListeners.get('transitionend')?.({ target, propertyName }), setReady: (value: boolean) => { homeReady = value }, setLayer: () => { layerPresent = true } }
}
test('prepaint is phone/home only; late, desktop, tablet, reduced motion and history restore are omitted', () => {
  for (const options of [{ painted: true }, { body: true }, { width: 1280 }, { reduced: true }, { path: '/player/pagos' }, { ua: 'iPad Tablet' }, { navigation: 'back_forward' }]) {
    const result = boot(options); assert.equal(result.styles.length, 0); assert.equal(result.window.__selpaOpening, undefined)
  }
})
test('a ready home crossfades after stable frames, without an artificial brand hold; exit is one-way', () => {
  const result = boot(); assert.equal(result.styles.length, 1); assert.equal(result.window.__selpaOpening?.active, true)
  assert.match(result.styles[0].textContent, /opacity:1;transition:opacity 420ms ease-in-out/)
  assert.doesNotMatch(result.styles[0].textContent, /\.app-shell/)
  result.advance(60); assert.ok(result.window.__selpaOpening!.leavingAt > 0)
  assert.match(result.styles[0].textContent, /\[data-pwa-opening\]\{opacity:0\}/)
  result.advance(420); assert.equal(result.window.__selpaOpening?.active, true, 'do not cut the transition with an exact-time timer')
  result.endTransition(); assert.equal(result.window.__selpaOpening?.active, false); assert.equal(result.styles.length, 0)
  result.window.__selpaOpening?.finish(); result.advance(2000); assert.equal(result.styles.length, 0)
  assert.equal(PWA_OPENING.exitMs, 420)
  assert.doesNotMatch(PWA_OPENING_BOOTSTRAP, /now - state.shownAt >=/)
})

test('navy body stays until home readiness, then restores behind an opaque layer before the fade', () => {
  const result = boot({ ready: false, layer: false })
  assert.match(result.styles[0].textContent, /html\{background:#061b3a/)
  assert.match(result.styles[0].textContent, /body\{background:#061b3a/)
  result.advance(300); assert.match(result.styles[0].textContent, /body\{background:/)
  result.setLayer(); result.advance(20)
  assert.match(result.styles[0].textContent, /body\{background:/)
  result.setReady(true); result.advance(48)
  assert.doesNotMatch(result.styles[0].textContent, /body\{background:/)
  assert.match(result.styles[0].textContent, /\[data-pwa-opening\].*opacity:1/)
  assert.equal(result.window.__selpaOpening?.leavingAt, 0, 'restore the Home background while the opening is still opaque')
  result.advance(16)
  assert.ok(result.window.__selpaOpening!.leavingAt > 0)
  assert.match(result.styles[0].textContent, /\[data-pwa-opening\]\{opacity:0\}/)
  result.listeners.get('pointerdown')!(); assert.equal(result.styles.length, 0)
})
test('slow home/fonts stay opaque instead of a timer revealing the loader, then fade only when ready', () => {
  const result = boot({ ready: false }); result.advance(3000)
  assert.equal(result.window.__selpaOpening?.active, true); assert.equal(result.window.__selpaOpening?.leavingAt, 0)
  result.setReady(true); result.document.fonts.status = 'loading'; result.advance(500); assert.equal(result.window.__selpaOpening?.leavingAt, 0)
  result.document.fonts.status = 'loaded'; result.advance(60); assert.ok(result.window.__selpaOpening!.leavingAt > 0)
  result.advance(560); assert.equal(result.styles.length, 0)
})

test('cleanup follows the layer opacity transition, not bubbling child effects; lost-event fallback remains bounded', () => {
  const result = boot(); result.advance(60)
  result.endTransition('transform'); result.endTransition('opacity', {})
  assert.equal(result.window.__selpaOpening?.active, true)
  result.endTransition(); assert.equal(result.styles.length, 0); assert.equal(result.layerListeners.size, 0)
  const lostEvent = boot(); lostEvent.advance(600); assert.equal(lostEvent.window.__selpaOpening?.active, false)
})

test('installed-phone html and body stay navy after exit; the app owns the unchanged light surface', () => {
  assert.match(PWA_OPENING_CANVAS_CSS, /display-mode: standalone/)
  assert.match(PWA_OPENING_CANVAS_CSS, /max-width: 600px/)
  assert.match(PWA_OPENING_CANVAS_CSS, /html,body\{background:#061b3a[^}]+!important\}/)
  assert.match(PWA_OPENING_CANVAS_CSS, /\.app-shell\{background:var\(--bg, #f4f7fb\);min-height:100%\}/)
  assert.doesNotMatch(PWA_OPENING_CANVAS_CSS, /:has\(|:empty|prefers-reduced-motion/)
  assert.doesNotMatch(PWA_OPENING_CANVAS_CSS, /(?:\{|;)\s*(?:opacity|animation|position|display)\s*:/)
  const layout = readFileSync('app/layout.tsx', 'utf8')
  assert.match(layout, /id="selpa-opening-canvas"/)
  assert.doesNotMatch(layout, /selpa-opening-bootstrap/)
})
test('interaction immediately retires the layer without cancelling the original gesture', () => {
  for (const name of ['pointerdown', 'keydown', 'focusin', 'wheel', 'touchmove']) {
    const result = boot({ ready: false }); result.advance(20); result.listeners.get(name)!()
    assert.equal(result.window.__selpaOpening?.active, false); assert.equal(result.styles.length, 0)
  }
})
test('native/web use original artwork; SSR markup is never mutated and motion has no independent hard cut', () => {
  const source = (p: string) => readFileSync(p, 'utf8'), layout = source('app/layout.tsx'), component = source('components/pwa/PwaOpening.tsx'), css = source('components/pwa/PwaOpening.module.css')
  assert.doesNotMatch(layout, /selpa-opening-bootstrap|<PwaOpening|startupImage:/)
  assert.ok(layout.indexOf('<AppShellClient') > layout.indexOf('<body>'))
  assert.match(source('app/pwa/startup/[screen]/route.tsx'), /getPwaOpeningArtwork/)
  assert.match(component, /PWA_OPENING\.medallion/)
  assert.doesNotMatch(component, /useEffect|useState|hidden =|\.decode\(|new window.Image/)
  assert.doesNotMatch(PWA_OPENING_BOOTSTRAP, /dataset|\.hidden|preventDefault|setTimeout\(finish, 1000/)
  for (const effect of ['breathing', 'halo', 'sweep', 'wordmark-in']) assert.match(css, new RegExp('@keyframes ' + effect))
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /orbit|rotate\(|\.medallion::after|border-top-color|border-right-color/)
  assert.match(css, /box-shadow: 0 0 20px 8px color-mix/)
  assert.match(css, /@keyframes halo \{ 0%, 100% \{ opacity: \.12;[^}]+\} 50% \{ opacity: \.72;/)
  assert.doesNotMatch(css, /opening-limit|surface-out/)
  for (const effect of ['breathing', 'halo', 'sweep']) assert.match(css, new RegExp('animation: ' + effect + '[^;]+infinite'))
  assert.match(source('app/page.tsx'), /<Suspense fallback=.*<PublicHomeContent/)
  assert.match(source('app/page.tsx'), /: <PublicHomeContent \/>/)
  assert.match(source('app/page.tsx'), /!\/iPad\|Tablet\/i.test\(ua\)/)
  assert.deepEqual(readFileSync('app/icon.png'), readFileSync('app/apple-icon.png'))
})
