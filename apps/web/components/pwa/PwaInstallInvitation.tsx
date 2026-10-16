'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { Download, X } from 'lucide-react'
import { getInstallMethod, getPopupInstallMethod, INSTALL_DISMISS_KEY, INSTALL_POPUP_PHONE_QUERY, isInstallDismissed, showInstallOnRoute, type InstallMethod, type PopupInstallMethod } from '@/lib/pwaInstallation'
import homePilot from '@/components/home/HomeMobilePilot.module.css'
import PwaInstallPopup, { type NativeInstallResult } from './PwaInstallPopup'

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const instructions: Record<Exclude<InstallMethod, 'native' | null>, string> = {
  'ios-safari': 'En Safari, abrí Compartir (cuadrado con flecha hacia arriba) y elegí Añadir a pantalla de inicio. Si aparece Abrir como app web, dejalo activado y tocá Añadir.',
  'ios-browser': 'Abrí esta dirección en Safari. Luego usá Compartir → Añadir a pantalla de inicio. Si aparece Abrir como app web, dejalo activado.',
  'android-chrome': 'En Chrome, abrí el menú ⋮ y buscá Instalar aplicación o Añadir a pantalla de inicio. Confirmá la opción que ofrezca tu navegador.',
  'android-samsung': 'En Samsung Internet, abrí el menú ☰ y buscá Añadir página a → Pantalla de inicio. La opción puede variar según la versión.',
}

export default function PwaInstallInvitation({ compact = false, target }: { compact?: boolean; target?: HTMLElement | null }) {
  const pathname = usePathname()
  const guideId = useId()
  const deferred = useRef<InstallPrompt | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dismissed = useRef(false)
  const [method, setMethod] = useState<InstallMethod>(null)
  const [popupMethod, setPopupMethod] = useState<PopupInstallMethod | null>(null)
  const [guide, setGuide] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)')
    const fullscreen = window.matchMedia('(display-mode: fullscreen)')
    const mobile = window.matchMedia('(max-width: 980px)')
    function sync() {
      let stored: string | null = null
      try { stored = localStorage.getItem(INSTALL_DISMISS_KEY) } catch { /* Private browsing may deny storage. */ }
      const installed = standalone.matches || fullscreen.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
      setMethod(!installed && mobile.matches && !dismissed.current && !isInstallDismissed(stored, Date.now())
        ? getInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, Boolean(deferred.current)) : null)
      setPopupMethod(!installed && !dismissed.current
        ? getPopupInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, Boolean(deferred.current)) : null)
    }
    function available(event: Event) {
      // Only the phone pilot replaces browser promotion. Desktop/tablet and
      // other routes retain their defaults; prompt() still requires a click.
      if (showInstallOnRoute(window.location.pathname) && window.matchMedia(INSTALL_POPUP_PHONE_QUERY).matches
        && getPopupInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, true) === 'native') event.preventDefault()
      deferred.current = event as InstallPrompt
      sync()
    }
    function installed() { deferred.current = null; dismissed.current = true; sync() }
    sync()
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', installed)
    window.addEventListener('storage', sync)
    window.addEventListener('pageshow', sync)
    standalone.addEventListener('change', sync)
    fullscreen.addEventListener('change', sync)
    mobile.addEventListener('change', sync)
    return () => {
      window.removeEventListener('beforeinstallprompt', available)
      window.removeEventListener('appinstalled', installed)
      window.removeEventListener('storage', sync)
      window.removeEventListener('pageshow', sync)
      standalone.removeEventListener('change', sync)
      fullscreen.removeEventListener('change', sync)
      mobile.removeEventListener('change', sync)
    }
  }, [])

  function dismiss() {
    dismissed.current = true
    try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())) } catch { /* In-memory dismissal still works. */ }
    setGuide(false)
    setMethod(null)
    setPopupMethod(null)
  }

  async function installNative(): Promise<NativeInstallResult> {
    if (!deferred.current) return 'unavailable'
    const event = deferred.current
    deferred.current = null // A native prompt may only be used once.
    setBusy(true)
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') { dismissed.current = true; setMethod(null); setPopupMethod(null) }
      else {
        setMethod(getInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, false))
        setPopupMethod(getPopupInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, false))
      }
      return outcome
    } catch {
      const fallback = getInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, false)
      setMethod(fallback)
      setPopupMethod(getPopupInstallMethod(navigator.userAgent, navigator.platform, navigator.maxTouchPoints, false))
      return 'unavailable'
    } finally { setBusy(false) }
  }

  async function install() {
    setMessage('')
    if (method !== 'native' || !deferred.current) { setGuide(value => !value); return }
    const outcome = await installNative()
    if (outcome === 'dismissed') dismiss()
    if (outcome === 'unavailable') {
      setGuide(true)
      setMessage('No se pudo abrir la instalación. Podés usar el menú del navegador.')
    }
  }

  const invitation = method && showInstallOnRoute(pathname) ? (
    <aside className={`pwa-install${compact ? ` ${homePilot.install}` : ''}`} aria-label="Instalar SELPA">
      <div className={`pwa-install__row${compact ? ` ${homePilot.installRow}` : ''}`}>
        <button ref={trigger} type="button" className={`px-btn px-btn--ghost${compact ? ` ${homePilot.installTrigger}` : ''}`} onClick={() => void install()} disabled={busy}
          aria-expanded={method === 'native' ? undefined : guide} aria-controls={method === 'native' ? undefined : guideId}>
          <Download size={18} aria-hidden="true" />{busy ? 'Abriendo instalación…' : compact ? 'Instalar SELPA' : 'Usar SELPA como app'}
        </button>
        <button type="button" className={`px-btn px-btn--ghost pwa-install__dismiss${compact ? ` ${homePilot.dismiss}` : ''}`} aria-label="No mostrar la invitación durante 7 días" onClick={dismiss}><X size={18} aria-hidden="true" /></button>
      </div>
      {guide && method !== 'native' ? <div id={guideId} className="pwa-install__guide" onKeyDown={event => {
        if (event.key === 'Escape') { setGuide(false); trigger.current?.focus() }
      }}>
        <p>{instructions[method]}</p>
        <button type="button" className="px-btn px-btn--ghost" onClick={() => { setGuide(false); trigger.current?.focus() }}>Entendido</button>
      </div> : null}
      {message ? <p role="status">{message}</p> : null}
    </aside>
  ) : null
  return <>
    {compact ? (target ? createPortal(invitation, target) : null) : invitation}
    <PwaInstallPopup method={popupMethod} ready={!compact || Boolean(target)} busy={busy} onInstall={installNative} />
  </>
}
