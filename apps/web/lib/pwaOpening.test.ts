import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(path, 'utf8')
const component = source('components/pwa/PwaOpening.tsx')
const css = source('components/pwa/PwaOpening.module.css')

test('opening is an initial-document phone PWA decoration, not a navigation gate', () => {
  assert.match(component, /display-mode: standalone/)
  assert.match(component, /navigator.*standalone/)
  assert.match(component, /iPad\|Tablet/)
  assert.match(component, /back_forward/)
  assert.match(component, /\}, \[\]\)/)
  assert.match(component, /hidden aria-hidden="true"/)
  assert.match(css, /pointer-events: none/)
  assert.doesNotMatch(component, /preventDefault\(|sessionStorage|localStorage|fetch\(|router\.|setInterval|serviceWorker/)
})
test('opening is bounded, dismisses on input, skips reduced motion and missing artwork', () => {
  assert.match(component, /setTimeout\(stop, 200\)/)
  assert.match(component, /780 - \(performance.now\(\) - started\)/)
  assert.match(component, /fast \? 420 : 220/)
  assert.match(component, /'pointerdown', 'keydown', 'focusin', 'wheel', 'touchmove'/)
  assert.match(component, /prefers-reduced-motion: reduce/)
  assert.match(component, /\.catch\(stop\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(css, /infinite|backdrop-filter|@import/)
})
test('opening reuses the original separate isotipo and wordmark without changing installed artwork', () => {
  assert.match(css, /selpa-isotipo\.png/)
  assert.match(css, /selpa-wordmark-clean\.png/)
  assert.match(css, /border-radius: 50%/)
  assert.equal((source('components/AppShellClient.tsx').match(/<PwaOpening \/>/g) ?? []).length, 1)
  assert.deepEqual(readFileSync('app/icon.png'), readFileSync('app/apple-icon.png'))
})
