'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Download, Ellipsis, ExternalLink, PlusSquare, Share, X } from 'lucide-react'
import { INSTALL_POPUP_DISMISS_KEY, INSTALL_POPUP_NEVER_KEY, INSTALL_POPUP_SESSION_KEY, INSTALL_POPUP_PHONE_QUERY, getInstallPopupStorageReason, showInstallOnRoute, type PopupInstallMethod } from '@/lib/pwaInstallation'
import styles from './PwaInstallPopup.module.css'

export type NativeInstallResult = 'accepted' | 'dismissed' | 'unavailable'

function visible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

function screenBusy() {
  const active = document.activeElement
  if (active?.closest('input, textarea, select, [contenteditable="true"], form')) return true
  return Array.from(document.querySelectorAll(
    'dialog[open], [role="dialog"], [aria-modal="true"], [aria-busy="true"], [data-pwa-install-blocked], [data-pwa-opening], .px-nav [aria-expanded="true"], .px-mobileMenu, .px-mobileClubMenu, .px-playerUserMenu, .px-notifPreview, .px-messagePreview, .px-searchPanel, .pwa-install__guide'
  )).some(visible)
}

/** Native dialog provides focus trapping, Escape and an inert background. No API request. */
export default function PwaInstallPopup({ method, ready, busy, onInstall }: {
  method: PopupInstallMethod | null
  ready: boolean
  busy: boolean
  onInstall: () => Promise<NativeInstallResult>
}) {
  const pathname = usePathname()
  const dialog = useRef<HTMLDialogElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const guideHeading = useRef<HTMLHeadingElement>(null)
  const seen = useRef(false)
  const [guide, setGuide] = useState(false)
  const [failed, setFailed] = useState(false)
  const [preferenceError, setPreferenceError] = useState(false)
  const titleId = useId(), descriptionId = useId(), guideId = useId()
  const eligible = Boolean(method) && ready && showInstallOnRoute(pathname)

  useEffect(() => {
    if (!eligible || seen.current) return
    const element = dialog.current
    if (!element) return
    // Read-only DOM diagnostics, no user data, storage reset or network log.
    const status = (reason: string) => { element.dataset.pwaInstallState = reason }
    if (typeof element.showModal !== 'function') { status('dialog-unavailable'); return } // Inline instructions remain usable.
    const phone = window.matchMedia(INSTALL_POPUP_PHONE_QUERY)
    const standalone = window.matchMedia('(display-mode: standalone)')
    const fullscreen = window.matchMedia('(display-mode: fullscreen)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const earliest = performance.now() + 1200
    const installed = () => standalone.matches || fullscreen.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    function stored(kind: 'localStorage' | 'sessionStorage', key: string) {
      try { return window[kind].getItem(key) } catch { return null }
    }
    function storageReason() {
      return getInstallPopupStorageReason(stored('sessionStorage', INSTALL_POPUP_SESSION_KEY), stored('localStorage', INSTALL_POPUP_DISMISS_KEY), Date.now(), stored('localStorage', INSTALL_POPUP_NEVER_KEY))
    }
    function attempt() {
      timer = undefined
      const blocked = seen.current ? 'session-seen' : dirty ? 'form-edited' : !phone.matches ? 'non-phone' : installed() ? 'installed' : storageReason() ?? (document.visibilityState !== 'visible' ? 'background' : null)
      if (blocked) { status(blocked); return }
      if (document.readyState === 'loading' || !document.querySelector('main h1, .px-main h1')) { status('waiting-home'); schedule(); return }
      if (screenBusy()) { status('blocked-operation'); schedule(); return }
      try { element!.showModal() } catch { status('dialog-failed'); schedule(); return }
      if (!visible(element!)) { element!.close(); status('display-failed'); schedule(); return }
      status('shown')
      seen.current = true
      try { sessionStorage.setItem(INSTALL_POPUP_SESSION_KEY, '1') } catch { /* In-memory fallback. */ }
      stopWatching()
      primary.current?.focus({ preventScroll: true })
    }
    function schedule() {
      if (element!.open && (!phone.matches || installed())) element!.close()
      // Coalesce mutations instead of restarting the clock: a live carousel
      // or class update must not starve the automatic invitation forever.
      if (!seen.current && !dirty && timer === undefined) timer = setTimeout(attempt, Math.max(400, earliest - performance.now()))
    }
    function editing(event: Event) {
      if (event.target instanceof Element && event.target.closest('form, input, textarea, select, [contenteditable="true"]')) dirty = true
    }
    function preferenceChanged(event: StorageEvent) {
      if (event.key !== INSTALL_POPUP_DISMISS_KEY && event.key !== INSTALL_POPUP_NEVER_KEY) return
      const reason = getInstallPopupStorageReason(null, stored('localStorage', INSTALL_POPUP_DISMISS_KEY), Date.now(), stored('localStorage', INSTALL_POPUP_NEVER_KEY))
      if (reason) { status(reason); if (element!.open) element!.close() }
      else schedule()
    }
    const observer = new MutationObserver(schedule)
    function stopWatching() {
      clearTimeout(timer)
      timer = undefined
      observer.disconnect()
      window.removeEventListener('load', schedule)
      document.removeEventListener('focusout', schedule)
      document.removeEventListener('input', editing, true)
      document.removeEventListener('visibilitychange', schedule)
    }
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'hidden', 'aria-expanded', 'aria-busy', 'aria-modal'] })
    window.addEventListener('load', schedule)
    document.addEventListener('focusout', schedule)
    document.addEventListener('input', editing, true)
    document.addEventListener('visibilitychange', schedule)
    phone.addEventListener('change', schedule)
    standalone.addEventListener('change', schedule)
    fullscreen.addEventListener('change', schedule)
    window.addEventListener('storage', preferenceChanged)
    schedule()
    return () => {
      stopWatching()
      phone.removeEventListener('change', schedule)
      standalone.removeEventListener('change', schedule)
      fullscreen.removeEventListener('change', schedule)
      window.removeEventListener('storage', preferenceChanged)
      if (element.open) element.close()
    }
  }, [eligible, pathname])

  useEffect(() => { if (guide) guideHeading.current?.focus({ preventScroll: true }) }, [guide])

  function close(choice: 'session' | 'week' | 'never' = 'session') {
    if (choice !== 'session') try {
      localStorage.setItem(choice === 'never' ? INSTALL_POPUP_NEVER_KEY : INSTALL_POPUP_DISMISS_KEY, choice === 'never' ? '1' : String(Date.now()))
    } catch {
      // Do not promise persistence when the browser refuses storage. The user
      // can still close; the in-memory/session guard prevents another popup.
      setPreferenceError(true)
      return
    }
    if (dialog.current) { dialog.current.dataset.pwaInstallState = choice === 'never' ? 'dismissed-permanently' : choice === 'week' ? 'dismissed-7days' : 'closed'; dialog.current.close() }
  }

  async function install() {
    if (method === 'native') {
      const outcome = await onInstall() // Direct click gesture; never triggered by the auto invitation.
      if (outcome !== 'unavailable') { close(); return }
      setFailed(true)
    }
    setGuide(true)
  }

  if (!eligible || !method) return null
  const ios = method.startsWith('ios-') || method === 'embedded-ios'
  const embedded = method.startsWith('embedded-')
  const chromeIphone = method === 'ios-chrome'
  return createPortal(
    <dialog ref={dialog} className={styles.dialog} data-pwa-install-method={method} aria-labelledby={titleId} aria-describedby={descriptionId} onClose={event => {
      if (event.currentTarget.dataset.pwaInstallState === 'shown') event.currentTarget.dataset.pwaInstallState = 'closed'
    }} onClick={event => {
      if (event.target !== dialog.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }}>
      <div className={styles.header}>
        <Image className={styles.logo} src="/icon.png" alt="" width={56} height={56} loading="eager" unoptimized />
        <div className={styles.heading}>{!chromeIphone ? <p>Tu comunidad deportiva</p> : null}<h2 id={titleId}>{chromeIphone ? 'Instalá SELPA en tu iPhone' : 'SELPA a mano'}</h2></div>
        <button type="button" className={`px-btn px-btn--ghost ${styles.close}`} onClick={() => close()} aria-label="Cerrar invitación de instalación"><X size={20} aria-hidden="true" /></button>
      </div>
      <p id={descriptionId} className={styles.copy}>{chromeIphone ? 'Accedé más rápido desde tu pantalla de inicio y abrí SELPA como app.' : 'Agregá SELPA a tu pantalla de inicio y entrá directo a tus clubes y torneos.'}</p>
      {guide ? <div id={guideId} className={styles.guide}>
        <h3 ref={guideHeading} tabIndex={-1}>{embedded ? 'Abrí SELPA en tu navegador' : chromeIphone ? 'En Chrome' : ios ? 'Añadir SELPA en iPhone' : 'Instalar desde tu navegador'}</h3>
        {failed ? <p role="status" className={styles.hint}>No se pudo abrir el diálogo. Seguí estos pasos desde el navegador.</p> : null}
        <ol className={styles.steps} role="list">
          {embedded ? <>
            <li><span>Abrí el menú de esta ventana <Ellipsis size={18} aria-hidden="true" /> y buscá <strong>Abrir en {ios ? 'Safari' : 'Chrome'}</strong> o «Abrir en el navegador».</span></li>
            <li><span>Si no aparece, copiá la dirección y pegala en {ios ? 'Safari' : 'Chrome'}. <ExternalLink size={18} aria-hidden="true" /></span></li>
            <li><span>Allí, usá {ios ? 'Compartir → Añadir a pantalla de inicio' : 'el menú → Instalar aplicación o Añadir a pantalla de inicio'} y confirmá.</span></li>
          </> : ios ? <>
            <li><span>{chromeIphone ? 'Tocá' : 'Abrí'} <strong>Compartir</strong> <Share size={18} aria-hidden="true" />{chromeIphone ? '.' : ' en el navegador (puede estar dentro de su menú).'}</span></li>
            <li><span>Elegí <strong>Añadir a pantalla de inicio</strong> <PlusSquare size={18} aria-hidden="true" />.</span></li>
            <li><span>{chromeIphone ? <>Dejá activado <strong>Abrir como app web</strong> y tocá <strong>Agregar</strong>.</> : <>Si aparece «Abrir como app web», dejalo activado. Tocá <strong>Añadir</strong>.</>}</span></li>
          </> : <>
            <li><span>Abrí el <strong>menú</strong> <Ellipsis size={18} aria-hidden="true" /> de {method === 'android-samsung' ? 'Samsung Internet' : method === 'android-chrome' ? 'Chrome' : 'tu navegador'}.</span></li>
            <li><span>Buscá <strong>{method === 'android-samsung' ? 'Añadir página a → Pantalla de inicio' : 'Instalar aplicación o Añadir a pantalla de inicio'}</strong>.</span></li>
            <li><span>Confirmá la opción que ofrezca tu navegador.</span></li>
          </>}
        </ol>
        {ios && !embedded && !chromeIphone ? <p className={styles.hint}>Si tu navegador no ofrece esta opción, abrí la misma dirección en Safari.</p> : null}
      </div> : null}
      <div className={styles.actions}>
        {guide ? <button type="button" className="px-btn" onClick={() => close()}>Entendido</button> : <button ref={primary} type="button" className="px-btn" disabled={busy} onClick={() => void install()} aria-expanded={method === 'native' ? undefined : guide} aria-controls={method === 'native' ? undefined : guideId}><Download size={18} aria-hidden="true" />{busy ? 'Abriendo instalación…' : 'Instalar SELPA'}</button>}
        <button type="button" className={`px-btn px-btn--ghost ${styles.secondary}`} onClick={() => close('week')}>Ahora no</button>
        <button type="button" className={`px-btn px-btn--ghost ${styles.secondary}`} onClick={() => close('never')}>No mostrar nunca más</button>
      </div>
      {preferenceError ? <p role="status" className={styles.hint}>El navegador no permitió guardar esta preferencia. Podés cerrar la invitación por esta sesión; la fila para instalar seguirá disponible.</p> : null}
      {!guide ? <p className={styles.hint}>{embedded ? 'Primero te mostramos cómo abrir tu navegador.' : method === 'native' ? 'Tu navegador te pedirá confirmar la instalación.' : 'Te mostramos los pasos; la confirmación se hace en tu navegador.'}</p> : null}
    </dialog>, document.body
  )
}
