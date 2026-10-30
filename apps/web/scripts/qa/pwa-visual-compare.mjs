/** Render reconstructed pre-PWA vs current WIP. Synthetic data, no submits. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CLUB, PLAYER, id, QA_TOKEN, QA_ACTORS } from './block1-fixture.mjs'

const require = createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE ?? 'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const sharp = createRequire(new URL('../../package.json', import.meta.url))('sharp')
const folder = fileURLToPath(new URL('../../../../output/pwa-visual-control-20261014/', import.meta.url))
await mkdir(folder, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.SELPA_QA_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const errors = [], writes = [], externalBlocked = [], comparisons = []
const tournament = id(91000)
const partner = { clubPlayerId: id(2003), userId: id(1003), name: 'Pareja de prueba local', avatarUrl: '/mock/player.jpg', category: 6, gender: 'M', approved: true }
function detail(registration) {
  return { tournament: { id: tournament, clubId: CLUB, name: 'Torneo de prueba local', status: 'OPEN', gender: 'MALE', type: 'OPEN', format: 'GROUPS_ELIMINATION', segment: 'ADULT', category: 6, startDate: '2026-12-10', endDate: '2026-12-12', registrationDeadline: '2026-12-09T23:00:00Z', pricePerPlayer: 1000, minPairs: 8, maxPairs: 16, pointsTotal: 100, rulesSummary: { description: null, competitionSystem: null, venueName: null, tiebreaker: null, courtsCount: 2, courts: [], scheduleMode: null, pointsMode: null } },
    club: { id: CLUB, name: 'Club Central', logoUrl: null, themeKey: null, city: null, province: null, address: null }, status: { key: 'registration_open', label: 'Inscripción abierta', priority: 1, className: '' }, flyerUrl: null,
    labels: { category: '6ª categoría', gender: 'Caballeros', segment: 'Adultos', tournamentType: 'Open' }, dates: { startDate: '2026-12-10', endDate: '2026-12-12', registrationDeadline: '2026-12-09' }, price: { pricePerPlayer: 1000 }, capacity: { registeredTeamsCount: 8, maxPairs: 16, spotsLeft: 8 },
    viewer: { isAuthenticated: true, isClubAdmin: false, isStaffAccount: false, isPlayerInClub: true, isRegisteredInTournament: registration !== null, clubPlayer: { id: id(2006), userId: PLAYER, name: 'Nombre quinto', category: 6, gender: 'M', approved: true },
      myTeam: registration === null ? null : { id: id(91001), registrationId: id(91002), registrationStatus: registration, paymentStatus: 'PENDING', paymentMethod: 'CASH_ON_SITE_REQUEST', registrationChangeRequest: null, players: [{ userId: PLAYER, name: 'Nombre quinto', avatarUrl: '/mock/player.jpg' }, { userId: partner.userId, name: partner.name, avatarUrl: partner.avatarUrl }] }, activePartnership: { id: id(91003), partner } } }
}
const player = { token: QA_TOKEN, userId: PLAYER }
const scenarios = [
  { name: 'home', path: '/' },
  { name: 'login', path: '/login' },
  { name: 'ranking', path: '/ranking?clubId=' + CLUB },
  { name: 'public-profile', path: `/jugadores/${PLAYER}?clubId=${CLUB}` },
  { name: 'my-ranking', path: '/player/ranking?clubId=' + CLUB, actor: player },
  { name: 'player-account', path: '/player/ranking?clubId=' + CLUB, actor: player, menu: 'Mi cuenta y actividad' },
  { name: 'player-club', path: '/player/ranking?clubId=' + CLUB, actor: player, menu: 'Club activo: Club Central' },
  { name: 'owner-account', path: '/ranking?clubId=' + CLUB, actor: QA_ACTORS[0], menu: 'Mi cuenta y actividad' },
  { name: 'owner-club', path: '/ranking?clubId=' + CLUB, actor: QA_ACTORS[0], menu: 'Club activo: Club Central' },
  { name: 'tournament', path: '/torneos/' + tournament, actor: player, registration: 'CONFIRMED' },
  { name: 'registration-pending', path: `/torneos/${tournament}/inscripcion`, actor: player, registration: 'PENDING' },
  ...[1, 2, 3, 4].map(step => ({ name: 'wizard-' + step, path: `/torneos/${tournament}/inscripcion`, actor: player, registration: null, step })),
]
async function capture(side, scenario, width) {
  const base = 'http://127.0.0.1:' + (side === 'before' ? 3013 : 3014)
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' })
  try {
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) { externalBlocked.push(url.hostname); return route.abort() }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { writes.push(request.method() + ' ' + url.pathname); return route.abort() }
      if (url.pathname === '/api/inbox-summary') return route.fulfill({ json: { notifications: 0, messages: 0, unread: 0 } })
      if (url.pathname === `/api/tournaments/${tournament}/public-detail`) return route.fulfill({ json: detail(scenario.registration ?? null) })
      return route.continue()
    })
    if (scenario.actor) await context.addInitScript(({ actor, tournament, partner }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: actor.token, refresh_token: 'QA_ONLY', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: actor.userId, email: 'fixture@invalid.test', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {} } }))
      localStorage.setItem(`pamprax:tournament-signup:${tournament}:${actor.userId}`, JSON.stringify({ selectedPartner: partner, selectedAvailabilitySlots: ['T1', 'T2'], selectedPaymentMethod: 'CASH_ON_SITE_REQUEST', currentStep: 1 }))
    }, { actor: scenario.actor, tournament, partner })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push({ side, scenario: scenario.name, error: error.message }))
    const response = await page.goto(base + scenario.path, { waitUntil: 'networkidle', timeout: 60000 })
    assert.equal(response.status(), 200, side + ':' + scenario.name)
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    assert.equal(viewport.includes('viewport-fit=cover'), side === 'after', 'Incorrect reconstructed baseline')
    if (scenario.actor) await page.getByRole('button', { name: 'Mi cuenta y actividad', exact: true }).waitFor()
    if (scenario.name === 'ranking') await page.locator('main').last().getByText('Ranking', { exact: true }).first().waitFor().catch(() => {})
    if (scenario.menu) await page.getByRole('button', { name: scenario.menu, exact: true }).click()
    if (scenario.step) await page.locator('.tournamentSignupPage__steps button').nth(scenario.step - 1).click()
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
    const fingerprint = await page.evaluate(() => {
      const round = value => Math.round(value * 100) / 100
      const properties = ['color', 'backgroundColor', 'backgroundImage', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderRadius', 'borderColor', 'boxShadow', 'gap', 'display', 'gridTemplateColumns', 'flexDirection']
      const elements = [...document.querySelectorAll('.app-shell,.app-shell *')].filter(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden')
      return { width: innerWidth, document: document.documentElement.scrollWidth, text: document.querySelector('.app-shell').innerText, elements: elements.map(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect()
        return { tag: node.tagName, rect: [rect.x, rect.y, rect.width, rect.height].map(round), style: Object.fromEntries(properties.map(property => [property, style[property]])) }
      }) }
    })
    assert.ok(fingerprint.document <= width, side + ':' + scenario.name + ' overflow')
    const image = await page.screenshot({ path: `${folder}${scenario.name}-${width}-${side}.png`, fullPage: true, animations: 'disabled', caret: 'hide' })
    await writeFile(`${folder}${scenario.name}-${width}-${side}.json`, JSON.stringify(fingerprint))
    return { image, fingerprint }
  } finally { await context.close() }
}
try {
  for (const width of [390, 1280]) {
    for (const scenario of scenarios.filter(item => width === 390 || ['login', 'ranking', 'public-profile'].includes(item.name))) {
      const before = await capture('before', scenario, width), after = await capture('after', scenario, width)
      const a = await sharp(before.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const b = await sharp(after.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let changedPixels = null
      if (a.info.width === b.info.width && a.info.height === b.info.height) {
        changedPixels = 0
        for (let i = 0; i < a.data.length; i += 4) if (!a.data.subarray(i, i + 4).equals(b.data.subarray(i, i + 4))) changedPixels++
      }
      const differences = []
      if (before.fingerprint.text !== after.fingerprint.text) differences.push('visible text')
      if (before.fingerprint.elements.length !== after.fingerprint.elements.length) differences.push('element count')
      for (let i = 0; i < Math.min(before.fingerprint.elements.length, after.fingerprint.elements.length); i++) {
        const a = before.fingerprint.elements[i], b = after.fingerprint.elements[i]
        if (JSON.stringify(a) !== JSON.stringify(b)) differences.push({ index: i, tag: a.tag, before: a, after: b })
      }
      const comparison = { scenario: scenario.name, width, beforeHeight: a.info.height, afterHeight: b.info.height, changedPixels, comparedPixels: a.info.width * a.info.height, geometryAndStyleDifferences: differences.length }
      comparisons.push(comparison)
      await writeFile(`${folder}${scenario.name}-${width}-differences.json`, JSON.stringify(differences, null, 2))
      console.log(JSON.stringify(comparison))
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, [])
  assert.ok(externalBlocked.every(host => host === 'www.svgrepo.com'))
} finally {
  await writeFile(folder + 'summary.json', JSON.stringify({ baseline: 'reconstructed pre-PWA shell + all non-PWA WIP, NOT historical screenshots', comparisons, errors, writes, externalBlocked: [...new Set(externalBlocked)], nativeIPhoneTested: false }, null, 2))
  await browser.close()
}
