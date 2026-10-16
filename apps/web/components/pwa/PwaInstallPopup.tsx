'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Download, Ellipsis, ExternalLink, PlusSquare, Share, X } from 'lucide-react'
import { INSTALL_DISMISS_KEY, INSTALL_POPUP_DISMISS_KEY, INSTALL_POPUP_SESSION_KEY, INSTALL_POPUP_PHONE_QUERY, isInstallDismissed, showInstallOnRoute, type PopupInstallMethod } from '@/lib/pwaInstallation'
import styles from './PwaInstallPopup.module.css'

export type NativeInstallResult = 'accepted' | 'dismissed' | 'unavailable'

function visible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

function screenBusy() {
  const active = document.activeElement
  if (active?.closest('input, textarea, select, [contenteditable="true"], form')) return true
  return Array.from(document.querySelectorAll(
    'dialog[open], [role="dialog"], [aria-modal="true"], [aria-busy="true"], [data-pwa-install-blocked], .px-nav [aria-expanded="true"], .px-mobileMenu, .px-mobileClubMenu, .px-playerUserMenu, .px-notifPreview, .px-messagePreview, .px-searchPanel, .pwa-install__guide'
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
  const titleId = useId(), descriptionId = useId(), guideId = useId()
  const eligible = Boolean(method) && ready && showInstallOnRoute(pathname)

  useEffect(() => {
    if (!eligible || seen.current) return
    const element = dialog.current
    if (!element || typeof element.showModal !== 'function') return // Inline instructions remain usable.
    const phone = window.matchMedia(INSTALL_POPUP_PHONE_QUERY)
    const standalone = window.matchMedia('(display-mode: standalone)')
    const fullscreen = window.matchMedia('(display-mode: fullscreen)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const installed = () => standalone.matches || fullscreen.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    function stored(kind: 'localStorage' | 'sessionStorage', key: string) {
      try { return window[kind].getItem(key) } catch { return null }
    }
    function blockedByStorage() {
      if (stored('sessionStorage', INSTALL_POPUP_SESSION_KEY)) return true
      // Respect the existing row's close, without coupling popup decline to it.
      return [INSTALL_POPUP_DISMISS_KEY, INSTALL_DISMISS_KEY].some(key => isInstallDismissed(stored('localStorage', key), Date.now()))
    }
    function attempt() {
      if (seen.current || dirty || !phone.matches || installed() || blockedByStorage()
        || document.visibilityState !== 'visible' || document.readyState !== 'complete'
        || !document.querySelector('main h1, .px-main h1') || screenBusy()) return
      try { element!.showModal() } catch { return }
      seen.current = true
      try { sessionStorage.setItem(INSTALL_POPUP_SESSION_KEY, '1') } catch { /* In-memory fallback. */ }
      stopWatching()
      primary.current?.focus({ preventScroll: true })
    }
    function schedule() {
      clearTimeout(timer)
      if (!seen.current) timer = setTimeout(attempt, 1800) // After load and a quiet, non-editing screen.
      if (element!.open && (!phone.matches || installed())) element!.close()
    }
    function editing(event: Event) {
      if (event.target instanceof Element && event.target.closest('form, input, textarea, select, [contenteditable="true"]')) dirty = true
    }
    const observer = new MutationObserver(schedule)
    function stopWatching() {
      clearTimeout(timer)
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
    schedule()
    return () => {
      stopWatching()
      phone.removeEventListener('change', schedule)
      standalone.removeEventListener('change', schedule)
      fullscreen.removeEventListener('change', schedule)
      if (element.open) element.close()
    }
  }, [eligible, pathname])

  useEffect(() => { if (guide) guideHeading.current?.focus({ preventScroll: true }) }, [guide])

  function close(snooze = false) {
    if (snooze) try { localStorage.setItem(INSTALL_POPUP_DISMISS_KEY, String(Date.now())) } catch { /* Session dismissal remains. */ }
    dialog.current?.close()
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
  return createPortal(
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onClick={event => {
      if (event.target !== dialog.current) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }}>
      <div className={styles.header}>
        <Image className={styles.logo} src="/icon.png" alt="" width={56} height={56} unoptimized />
        <div className={styles.heading}><p>Tu comunidad deportiva</p><h2 id={titleId}>SELPA a mano</h2></div>
        <button type="button" className={`px-btn px-btn--ghost ${styles.close}`} onClick={() => close()} aria-label="Cerrar invitación de instalación"><X size={20} aria-hidden="true" /></button>
      </div>
      <p id={descriptionId} className={styles.copy}>Agregá SELPA a tu pantalla de inicio y entrá directo a tus clubes y torneos.</p>
      {guide ? <div id={guideId} className={styles.guide}>
        <h3 ref={guideHeading} tabIndex={-1}>{embedded ? 'Abrí SELPA en tu navegador' : ios ? 'Añadir SELPA en iPhone' : 'Instalar desde tu navegador'}</h3>
        {failed ? <p role="status" className={styles.hint}>No se pudo abrir el diálogo. Seguí estos pasos desde el navegador.</p> : null}
        <ol className={styles.steps} role="list">
          {embedded ? <>
            <li><span>Abrí el menú de esta ventana <Ellipsis size={18} aria-hidden="true" /> y buscá <strong>Abrir en {ios ? 'Safari' : 'Chrome'}</strong> o «Abrir en el navegador».</span></li>
            <li><span>Si no aparece, copiá la dirección y pegala en {ios ? 'Safari' : 'Chrome'}. <ExternalLink size={18} aria-hidden="true" /></span></li>
            <li><span>Allí, usá {ios ? 'Compartir → Añadir a pantalla de inicio' : 'el menú → Instalar aplicación o Añadir a pantalla de inicio'} y confirmá.</span></li>
          </> : ios ? <>
            <li><span>Abrí <strong>Compartir</strong> <Share size={18} aria-hidden="true" /> en el navegador (puede estar dentro de su menú).</span></li>
            <li><span>Elegí <strong>Añadir a pantalla de inicio</strong> <PlusSquare size={18} aria-hidden="true" />.</span></li>
            <li><span>Si aparece «Abrir como app web», dejalo activado. Tocá <strong>Añadir</strong>.</span></li>
          </> : <>
            <li><span>Abrí el <strong>menú</strong> <Ellipsis size={18} aria-hidden="true" /> de {method === 'android-samsung' ? 'Samsung Internet' : method === 'android-chrome' ? 'Chrome' : 'tu navegador'}.</span></li>
            <li><span>Buscá <strong>{method === 'android-samsung' ? 'Añadir página a → Pantalla de inicio' : 'Instalar aplicación o Añadir a pantalla de inicio'}</strong>.</span></li>
            <li><span>Confirmá la opción que ofrezca tu navegador.</span></li>
          </>}
        </ol>
        {ios && !embedded ? <p className={styles.hint}>Si tu navegador no ofrece esta opción, abrí la misma dirección en Safari.</p> : null}
      </div> : null}
      <div className={styles.actions}>
        {guide ? <button type="button" className="px-btn" onClick={() => close()}>Entendido</button> : <button ref={primary} type="button" className="px-btn" disabled={busy} onClick={() => void install()} aria-expanded={method === 'native' ? undefined : guide} aria-controls={method === 'native' ? undefined : guideId}><Download size={18} aria-hidden="true" />{busy ? 'Abriendo instalación…' : 'Instalar SELPA'}</button>}
        <button type="button" className={`px-btn px-btn--ghost ${styles.secondary}`} onClick={() => close(true)}>Ahora no</button>
      </div>
      {!guide ? <p className={styles.hint}>{embedded ? 'Primero te mostramos cómo abrir tu navegador.' : method === 'native' ? 'Tu navegador te pedirá confirmar la instalación.' : 'Te mostramos los pasos; la confirmación se hace en tu navegador.'}</p> : null}
    </dialog>, document.body
  )
}
