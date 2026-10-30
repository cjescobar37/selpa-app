/** Real Chromium; synthetic local Auth/DB only. Never exports tokens/storageState. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PLAYER, CLUB, QA_TOKEN, QA_ACTORS } from './block1-fixture.mjs'

const require = createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE ?? 'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const base = process.env.SELPA_PWA_QA_BASE ?? 'http://127.0.0.1:3000'
assert.equal(new URL(base).hostname, '127.0.0.1', 'QA must stay on loopback')
const folder = fileURLToPath(new URL('../../../../output/pwa-phase1-qa/', import.meta.url))
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.SELPA_QA_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const result = { engine: 'Chromium desktop, NOT native iOS/Android', metadata: {}, images: [], layouts: [], auth: [], privateReads: [], cache: [], external: [], unexpectedWrites: [], runtimeErrors: [] }
const user = { id: PLAYER, email: 'pwa-qa@invalid.test', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const session = { access_token: QA_TOKEN, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }

async function context(options = {}) {
  const ctx = await browser.newContext(options)
  await ctx.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { result.external.push(url.hostname); return route.abort() }
    if (url.pathname === '/auth/v1/token' && request.method() === 'POST') return route.fulfill({ json: session })
    if (url.pathname === '/auth/v1/logout' && request.method() === 'POST') return route.fulfill({ status: 204, body: '' })
    if (url.pathname === '/api/inbox-summary') return route.fulfill({ json: { notifications: 0, messages: 0, unread: 0 } })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !url.pathname.startsWith('/rest/v1/rpc/') && !url.pathname.includes('_next')) {
      result.unexpectedWrites.push(request.method() + ' ' + url.pathname)
      return route.abort()
    }
    return route.continue()
  })
  ctx.on('page', page => page.on('pageerror', error => result.runtimeErrors.push(error.message)))
  return ctx
}
async function go(page, path) {
  const response = await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
  assert.equal(response.status(), 200, path)
}
async function noCaches(page, stage) {
  const cache = await page.evaluate(async () => ({ caches: await caches.keys(), workers: (await navigator.serviceWorker.getRegistrations()).length }))
  assert.deepEqual(cache.caches, [], stage)
  assert.equal(cache.workers, 0, stage)
  result.cache.push({ stage, ...cache })
}
async function measure(page, label, inset = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const data = await page.evaluate(() => {
    const nav = document.querySelector('.px-nav'), shell = document.querySelector('.app-shell'), bar = document.querySelector('.px-mobileBar')
    const rect = element => element?.getBoundingClientRect().toJSON()
    return { width: innerWidth, document: document.documentElement.scrollWidth, nav: rect(nav), bar: rect(bar), navPadding: getComputedStyle(nav).paddingTop, shellLeft: getComputedStyle(shell).paddingLeft, shellRight: getComputedStyle(shell).paddingRight, footerBottom: document.querySelector('.px-footer') ? getComputedStyle(document.querySelector('.px-footer')).paddingBottom : null }
  })
  assert.ok(data.document <= data.width, `${label}: overflow ${JSON.stringify(data)}`)
  assert.equal(data.navPadding, `${inset.top}px`, label)
  assert.equal(data.shellLeft, `${inset.left}px`, label)
  assert.equal(data.shellRight, `${inset.right}px`, label)
  if(data.footerBottom!==null) assert.equal(data.footerBottom, `${inset.bottom}px`, label)
  if (data.width <= 980) assert.ok(data.bar.y >= inset.top, label)
  result.layouts.push({ label, ...data })
}

try {
  const manifestResponse = await fetch(base + '/manifest.webmanifest')
  assert.equal(manifestResponse.status, 200)
  assert.match(manifestResponse.headers.get('content-type'), /manifest\+json/)
  const manifest = await manifestResponse.json()
  assert.equal(manifest.name, 'SELPA'); assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/')
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.theme_color, '#313b4c')
  assert.equal(manifest.background_color, '#061b3a')
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'))
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'))
  result.metadata.manifest = manifest
  for (const icon of manifest.icons) {
    const response = await fetch(base + icon.src), bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/)
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes)
    result.images.push({ url: icon.src, size: icon.sizes, bytes: bytes.length })
  }
  const guest = await context({ viewport: { width: 390, height: 844 } })
  const page = await guest.newPage()
  await go(page, '/login')
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /viewport-fit=cover/)
  assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'), /user-scalable=no|maximum-scale=1/)
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes')
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content'), 'default')
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute('href')
  const apple = await fetch(base + appleIcon), appleBytes = Buffer.from(await apple.arrayBuffer())
  assert.equal(apple.status, 200); assert.equal(appleBytes.readUInt32BE(16), 512)
  result.images.push({ url: appleIcon, bytes: appleBytes.length, platform: 'apple-touch-icon' })
  const startup = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll(links => links.map(link => ({ url: link.getAttribute('href'), media: link.getAttribute('media') })))
  assert.equal(startup.length, 22)
  for (const image of startup) {
    const response = await fetch(base + image.url), bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, 200, image.url)
    const [, width, height, scale, orientation] = new URL(image.url, base).pathname.match(/(\d+)x(\d+)-(\d+)-(portrait|landscape)$/)
    assert.equal(bytes.readUInt32BE(16), Number(orientation === 'portrait' ? width : height) * Number(scale))
    assert.equal(bytes.readUInt32BE(20), Number(orientation === 'portrait' ? height : width) * Number(scale))
    result.images.push({ url: image.url, bytes: bytes.length })
  }
  assert.equal((await fetch(base + '/pwa/startup/not-a-device')).status, 404)
  const cdp = await guest.newCDPSession(page)
  const appManifest = await cdp.send('Page.getAppManifest')
  assert.equal(appManifest.errors.length, 0)
  result.metadata.chromiumManifestErrors = appManifest.errors
  result.metadata.installability = await cdp.send('Page.getInstallabilityErrors')
  for (const width of [320, 375, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of ['/login', `/ranking?clubId=${CLUB}`]) {
      await go(page, path); await measure(page, `${path.split('?')[0]}-${width}`)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await go(page, '/login')
  let nativeInsetOverride = true
  try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, right: 0, bottom: 34, left: 0 } }) } catch { nativeInsetOverride = false }
  if (!nativeInsetOverride) await page.addStyleTag({ content: ':root{--selpa-safe-top:59px;--selpa-safe-bottom:34px}' })
  result.metadata.insetSimulation = nativeInsetOverride ? 'Chromium env override, NOT iOS' : 'CSS variable injection, NOT native insets'
  await measure(page, 'notch-portrait', { top: 59, right: 0, bottom: 34, left: 0 })
  await page.screenshot({ path: folder + 'login-notch-390.png', fullPage: true })
  if (nativeInsetOverride) {
    await page.setViewportSize({ width: 844, height: 390 })
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 44, bottom: 21, left: 44 } })
    await measure(page, 'notch-landscape', { top: 0, right: 44, bottom: 21, left: 44 })
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0 } })
  }
  await noCaches(page, 'guest')
  await guest.close()

  const signed = await context({ viewport: { width: 390, height: 844 } }), login = await signed.newPage()
  const deep = `/player/ranking?clubId=${CLUB}`
  await go(login, '/login?next=' + encodeURIComponent(deep))
  await login.locator('input[type="email"]').fill('pwa-qa@invalid.test')
  await login.locator('input[type="password"]').fill('synthetic-only-not-a-real-password')
  await login.getByRole('button', { name: 'Ingresar', exact: true }).click()
  await login.waitForURL(url => url.pathname === '/player/ranking', { timeout: 60000 })
  assert.equal(new URL(login.url()).searchParams.get('clubId'), CLUB)
  await login.getByRole('button', { name: 'Club activo: Club Central', exact: true }).waitFor()
  result.auth.push('synthetic password login preserves deep URL and restores PLAYER club')
  await login.reload({ waitUntil: 'networkidle' })
  await login.getByRole('button', { name: 'Club activo: Club Central', exact: true }).waitFor()
  await login.goto(base + '/ranking?clubId=' + CLUB, { waitUntil: 'networkidle' })
  await login.goBack({ waitUntil: 'networkidle' })
  assert.equal(new URL(login.url()).pathname, '/player/ranking')
  result.auth.push('reload + browser Back keep authenticated route')
  for (const [path, token] of [['/api/player/my-ranking?clubId=' + CLUB, QA_TOKEN], ['/api/player/finance?clubId=' + CLUB, QA_TOKEN], ['/api/clubs/billing?clubId=' + CLUB, QA_ACTORS[0].token]]) {
    const response = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token } })
    assert.equal(response.status, 200, path); assert.match(response.headers.get('cache-control'), /no-store/)
    result.privateReads.push({ path, status: response.status, cache: response.headers.get('cache-control') })
  }
  await noCaches(login, 'authenticated-private-reads')
  // In-memory synthetic state only: simulate closing/reopening an existing app profile.
  const state = await signed.storageState()
  await signed.close()
  const reopened = await context({ viewport: { width: 390, height: 844 }, storageState: state })
  const resumed = await reopened.newPage(); await go(resumed, deep)
  await resumed.getByRole('button', { name: 'Club activo: Club Central', exact: true }).waitFor()
  if (nativeInsetOverride) {
    const resumedCdp = await reopened.newCDPSession(resumed)
    await resumedCdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, right: 0, bottom: 34, left: 0 } })
    await measure(resumed, 'authenticated-notch', { top: 59, right: 0, bottom: 34, left: 0 })
  }
  await resumed.getByRole('button', { name: 'Mi cuenta y actividad', exact: true }).click()
  await resumed.getByRole('menuitem', { name: 'Mi cuenta', exact: true }).waitFor()
  const menuBounds = await resumed.getByRole('menu', { name: 'Mi espacio', exact: true }).boundingBox()
  assert.ok(menuBounds.y >= (nativeInsetOverride ? 59 : 0))
  assert.ok(menuBounds.y + menuBounds.height <= 844 - (nativeInsetOverride ? 34 : 0))
  result.auth.push('reopened browser profile rehydrates PLAYER role + active club')
  await resumed.screenshot({ path: folder + 'player-restored-390.png', fullPage: true })
  await resumed.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await resumed.waitForURL(url => url.pathname === '/login')
  assert.equal(await resumed.evaluate(() => localStorage.getItem('sb-127-auth-token')), null)
  await resumed.goBack({ waitUntil: 'networkidle' })
  await resumed.waitForURL(url => url.pathname === '/login')
  result.auth.push('browser Back after logout cannot re-enter the private route')
  await resumed.goto(base + deep, { waitUntil: 'networkidle' })
  await resumed.waitForURL(url => url.pathname === '/login')
  await noCaches(resumed, 'logout')
  result.auth.push('logout clears SDK session; private deep link requires login again')
  await reopened.close()
  const owner = await context({ viewport: { width: 390, height: 844 } }), admin = await owner.newPage()
  await go(admin, '/ranking?clubId=' + CLUB)
  await admin.evaluate(({ token, userId }) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'qa-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} } })), QA_ACTORS[0])
  await admin.reload({ waitUntil: 'networkidle' })
  await admin.getByRole('button', { name: 'Mi cuenta y actividad', exact: true }).click()
  await admin.getByRole('menu', { name: 'Cuenta del administrador', exact: true }).waitFor()
  assert.equal(await admin.getByRole('link', { name: 'Mi ranking', exact: true }).count(), 0)
  result.auth.push('OWNER restored as staff, not PLAYER')
  await owner.close()
  assert.deepEqual(result.runtimeErrors, [])
  // Existing Google-login artwork uses SVGRepo. Block that asset as well, but
  // distinguish it from an unexpected production/Auth/Data API connection.
  assert.ok(result.external.every(host => host === 'www.svgrepo.com'))
  assert.deepEqual(result.unexpectedWrites, [])
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
