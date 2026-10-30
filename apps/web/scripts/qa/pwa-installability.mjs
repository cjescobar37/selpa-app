/** Chromium's real manifest/installability checks in a fresh non-incognito
 * temporary profile. Does NOT install an OS app or use real account data. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
const require = createRequire(process.env.SELPA_PLAYWRIGHT_PACKAGE ?? 'C:/Users/CESCOBAR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const profile = await mkdtemp(join(tmpdir(), 'selpa-pwa-installability-'))
const base = process.env.SELPA_PWA_QA_BASE ?? 'http://127.0.0.1:3000'
assert.equal(new URL(base).hostname, '127.0.0.1')
let context
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.SELPA_QA_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort()
  })
  const page = context.pages()[0]
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  const cdp = await context.newCDPSession(page)
  const manifest = await cdp.send('Page.getAppManifest')
  const installability = await cdp.send('Page.getInstallabilityErrors')
  assert.deepEqual(manifest.errors, [])
  assert.deepEqual(installability.installabilityErrors, [])
  console.log(JSON.stringify({ engine: 'Chrome desktop, non-incognito headless profile', manifestErrors: manifest.errors, installabilityErrors: installability.installabilityErrors, osInstallationPerformed: false, nativeMobileTested: false }))
} finally {
  await context?.close()
  // Delete only this task's freshly generated temp profile, never a user profile.
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('selpa-pwa-installability-')) throw Error('Unsafe temporary profile path')
  await rm(profile, { recursive: true, force: true })
}
