import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { getInstallMethod, getPopupInstallMethod, getInstallPopupStorageReason, isInstallDismissed, INSTALL_DISMISS_MS, INSTALL_DISMISS_KEY, INSTALL_POPUP_DISMISS_KEY, INSTALL_POPUP_NEVER_KEY, INSTALL_POPUP_SESSION_KEY, showInstallOnRoute } = await import(new URL('./pwaInstallation.ts', import.meta.url).href) as typeof import('./pwaInstallation')
const source = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

test('native capability wins; manual instructions distinguish iOS and Android browsers', () => {
  assert.equal(getInstallMethod('unknown', '', 0, true), 'native')
  assert.equal(getInstallMethod('iPhone Version/26.0 Mobile Safari/605.1', 'iPhone', 5, false), 'ios-safari')
  assert.equal(getInstallMethod('iPhone CriOS/140 Safari/604', 'iPhone', 5, false), 'ios-chrome')
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

test('progressive UI preserves SSR and only customizes native promotion on pilot phones', () => {
  const component = source('components/pwa/PwaInstallInvitation.tsx')
  assert.match(component, /useState<InstallMethod>\(null\)/)
  assert.match(component, /navigator.*standalone/)
  assert.match(component, /localStorage.setItem\(INSTALL_DISMISS_KEY, String\(Date.now\(\)\)\)/)
  assert.match(component, /showInstallOnRoute\(window.location.pathname\).*window.matchMedia\(INSTALL_POPUP_PHONE_QUERY\)/)
  assert.match(component, /getPopupInstallMethod.*=== 'native'\) event.preventDefault\(\)/)
  assert.doesNotMatch(component, /setTimeout|fetch\(|access_token|refresh_token|suppressHydrationWarning|serviceWorker|caches\./)
  assert.match(component, /removeEventListener\('beforeinstallprompt'/)
})

test('native startup stays solid navy; reduced-motion entry and original web artwork are preserved', () => {
  const css = source('app/pwa.css'), startup = source('app/pwa/startup/[screen]/route.tsx')
  assert.match(css, /max-width: 980px\) and \(display-mode: standalone\) and \(prefers-reduced-motion: no-preference\)/)
  assert.match(css, /animation: selpa-app-entry 160ms ease-out/)
  assert.doesNotMatch(css, /animation-delay|visibility: hidden|opacity: 0[;}]/)
  assert.match(startup, /backgroundColor:\s*'#061b3a'/)
  assert.doesNotMatch(startup, /getPwaOpeningArtwork|<img|backgroundImage:/)
  assert.match(source('app/layout.tsx'), /<PwaOpening artwork=\{getPwaOpeningArtwork\(\)\}/)
  assert.match(source('components/pwa/PwaOpening.tsx'), /src=\{artwork\.symbol\}/)
  assert.match(source('components/pwa/PwaOpening.tsx'), /src=\{artwork\.wordmark\}/)
  assert.match(source('lib/pwaOpeningArtwork.server.ts'), /public\/brand\/selpa-wordmark-clean.png/)
})

test('automatic invitation distinguishes phones and embedded browsers without changing tablet/desktop', () => {
  const iphone = 'iPhone Version/26 Mobile Safari/605'
  assert.equal(getPopupInstallMethod(iphone, 'iPhone', 5, false), 'ios-safari')
  assert.equal(getPopupInstallMethod('iPhone CriOS/140 Mobile Safari/605', 'iPhone', 5, false), 'ios-chrome')
  for (const app of ['WhatsApp', 'Instagram', 'FBAN', 'Line/']) {
    assert.equal(getPopupInstallMethod(iphone + ' ' + app, '', 5, true), 'embedded-ios')
  }
  assert.equal(getPopupInstallMethod('iPhone AppleWebKit/605 Mobile/15', '', 5, false), 'embedded-ios')
  assert.equal(getPopupInstallMethod('Android; wv) Chrome/140 Mobile Safari/537', '', 5, true), 'embedded-android')
  assert.equal(getPopupInstallMethod('Android Chrome/140 Mobile Safari/537', '', 5, true), 'native')
  assert.equal(getPopupInstallMethod('Android Firefox/140 Mobile', '', 5, false), 'android-browser')
  for (const ua of ['iPad Version/26 Safari/605', 'Android Chrome/140 Safari/537', 'Android Tablet Mobile', 'Windows Chrome/140']) assert.equal(getPopupInstallMethod(ua, '', 5, true), null)
  assert.equal(getPopupInstallMethod('Macintosh Safari/605', 'MacIntel', 5, true), null)
})

test('popup decline is separate from row dismissal, bounded and session-limited', () => {
  assert.equal(new Set([INSTALL_DISMISS_KEY, INSTALL_POPUP_DISMISS_KEY, INSTALL_POPUP_NEVER_KEY, INSTALL_POPUP_SESSION_KEY]).size, 4)
  const popup = source('components/pwa/PwaInstallPopup.tsx')
  assert.match(popup, /sessionStorage.setItem\(INSTALL_POPUP_SESSION_KEY, '1'\)/)
  assert.match(popup, /localStorage.setItem\(choice === 'never' \? INSTALL_POPUP_NEVER_KEY : INSTALL_POPUP_DISMISS_KEY, choice === 'never' \? '1' : String\(Date.now\(\)\)\)/)
  assert.doesNotMatch(popup, /localStorage.setItem\(INSTALL_DISMISS_KEY/)
  assert.doesNotMatch(popup, /\bINSTALL_DISMISS_KEY\b/)
  assert.match(popup, /data-pwa-install-method=\{method\}/)
  const invitation = source('components/pwa/PwaInstallInvitation.tsx')
  const dismiss = invitation.slice(invitation.indexOf('function dismiss()'), invitation.indexOf('async function installNative'))
  assert.doesNotMatch(dismiss, /setPopupMethod/)
  assert.match(invitation, /setPopupMethod\(!installed && !nativeDeclined.current\s*\? getPopupInstallMethod/)
  assert.match(invitation, /setMethod\(rowIsDismissed\(dismissed.current\) \? null : fallback\)/)
  assert.match(popup, /dialog\[open\].*\[aria-busy="true"\]/)
  assert.match(popup, /document.addEventListener\('input', editing, true\)/)
  assert.match(popup, /document.readyState === 'loading'/)
  assert.match(popup, /timer === undefined/)
  assert.match(popup, /earliest - performance.now\(\)/)
  assert.match(popup, /\[data-pwa-opening\]/)
  assert.match(popup, /if \(!visible\(element!\)\)/)
  assert.match(popup, /element!\.showModal\(\)/)
  assert.match(popup, /aria-labelledby=\{titleId\} aria-describedby=\{descriptionId\}/)
  assert.doesNotMatch(popup, /fetch\(|serviceWorker|access_token|refresh_token/)
  const css = source('components/pwa/PwaInstallPopup.module.css')
  assert.match(css, /max-width: 600px/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.doesNotMatch(css, /:root|:global|font-family|#[\da-f]{3,8}/i)
})

test('permanent popup preference is explicit, independent, and never expires accidentally', () => {
  const now = 1_800_000_000_000
  assert.equal(getInstallPopupStorageReason(null, null, now, '1'), 'dismissed-permanently')
  assert.equal(getInstallPopupStorageReason('1', String(now), now + 365 * 24 * 60 * 60 * 1000, '1'), 'dismissed-permanently')
  for (const value of [null, '', '0', 'true', 'broken']) assert.equal(getInstallPopupStorageReason(null, null, now, value), null)
  const popup = source('components/pwa/PwaInstallPopup.tsx'), row = source('components/pwa/PwaInstallInvitation.tsx')
  for (const choice of ['week', 'never']) assert.match(popup, new RegExp("close\\('" + choice + "'\\)"))
  assert.match(popup, /No mostrar nunca más/)
  assert.match(popup, /El navegador no permitió guardar esta preferencia/)
  assert.match(popup, /removeEventListener\('storage', preferenceChanged\)/)
  assert.doesNotMatch(row, /INSTALL_POPUP_NEVER_KEY|INSTALL_POPUP_DISMISS_KEY/)
  assert.match(row, /if \(!window.matchMedia\(INSTALL_POPUP_PHONE_QUERY\).matches/)
})

test('Chrome iPhone instructions match the observed web-app installation flow', () => {
  const popup = source('components/pwa/PwaInstallPopup.tsx')
  for (const text of ['Instalá SELPA en tu iPhone', 'Accedé más rápido desde tu pantalla de inicio y abrí SELPA como app.', 'Añadir a pantalla de inicio', 'Abrir como app web', 'Agregar']) assert.ok(popup.includes(text))
  assert.match(popup, /chromeIphone \? 'Tocá' : 'Abrí'/)
  assert.doesNotMatch(popup, /a la derecha de la barra de direcciones/)
  assert.match(source('components/pwa/PwaInstallInvitation.tsx'), /'ios-chrome': 'En Chrome, tocá Compartir → Añadir a pantalla de inicio\. Dejá activado Abrir como app web y tocá Agregar\.'/)
})

test('popup storage ignores row dismissal and invalid session markers, but preserves valid declines', () => {
  const now = 1_800_000_000_000
  assert.equal(getInstallPopupStorageReason(null, null, now), null)
  assert.equal(getInstallPopupStorageReason('1', null, now), 'session-seen')
  assert.equal(getInstallPopupStorageReason(null, String(now - 1), now), 'dismissed-7days')
  for (const value of [null, '', 'broken', String(now + 1), String(now - INSTALL_DISMISS_MS)]) {
    assert.equal(getInstallPopupStorageReason('corrupt', value, now), null)
  }
})
