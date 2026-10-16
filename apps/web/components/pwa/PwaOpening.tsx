'use client'

import { useEffect, useRef } from 'react'
import styles from './PwaOpening.module.css'

const PHONE = '(max-width: 600px), (max-height: 600px) and (max-width: 980px) and (orientation: landscape)'
const ART = ['/brand/selpa-isotipo.png', '/brand/selpa-wordmark-clean.png']

/** Decorative initial-document transition. Never gates rendering, focus or input. */
export default function PwaOpening() {
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = layer.current
    const phone = matchMedia(PHONE)
    const standalone = matchMedia('(display-mode: standalone)')
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const installed = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    const ua = navigator.userAgent
    const mobile = /iPhone|iPod|Android.*Mobile/i.test(ua) && !/iPad|Tablet/i.test(ua)
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (!element || !mobile || !phone.matches || !installed() || reduced.matches
      || !['/', '/player'].includes(location.pathname) || navigation?.type === 'back_forward'
      || document.visibilityState !== 'visible') return

    const started = performance.now()
    let stopped = false
    let leaving = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    let removal: ReturnType<typeof setTimeout> | undefined
    const content = document.querySelector('main')
    const ready = () => Boolean(content?.querySelector('h1')) && !content?.matches('[aria-busy="true"]') && !content?.querySelector('[aria-busy="true"]')
    const observer = new MutationObserver(() => { if (ready()) leave() })

    function stop() {
      stopped = true
      element!.hidden = true
      clearTimeout(deadline)
      clearTimeout(removal)
      observer.disconnect()
      for (const name of ['pointerdown', 'keydown', 'focusin', 'wheel', 'touchmove']) document.removeEventListener(name, stop, true)
      document.removeEventListener('visibilitychange', changed)
      window.removeEventListener('pagehide', stop)
      phone.removeEventListener('change', changed)
      standalone.removeEventListener('change', changed)
      reduced.removeEventListener('change', changed)
    }
    function leave(fast = false) {
      if (stopped || leaving) return
      leaving = true
      observer.disconnect()
      clearTimeout(deadline)
      element!.dataset.phase = fast ? 'fast' : 'leaving'
      removal = setTimeout(stop, fast ? 420 : 220)
    }
    function changed() { if (!phone.matches || !installed() || reduced.matches || document.visibilityState !== 'visible') stop() }
    // No preventDefault: the original gesture continues to its intended control.
    for (const name of ['pointerdown', 'keydown', 'focusin', 'wheel', 'touchmove']) document.addEventListener(name, stop, { capture: true, passive: true })
    document.addEventListener('visibilitychange', changed)
    window.addEventListener('pagehide', stop)
    phone.addEventListener('change', changed)
    standalone.addEventListener('change', changed)
    reduced.addEventListener('change', changed)

    // Never reveal half-loaded branding or a late splash over an already-used page.
    // Slow/missing artwork simply skips the decoration; the home keeps loading.
    deadline = setTimeout(stop, 200)
    void Promise.all(ART.map(src => {
      const image = new window.Image()
      image.src = src
      return image.decode()
    })).then(() => {
      if (stopped || document.activeElement?.closest('input, textarea, select, [contenteditable="true"], button, a')) return
      clearTimeout(deadline)
      element.hidden = false
      element.dataset.phase = 'entering'
      if (ready()) leave(true)
      else {
        if (content) observer.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] })
        deadline = setTimeout(() => leave(), Math.max(0, 780 - (performance.now() - started)))
      }
    }).catch(stop)

    return stop
  }, [])

  return <div ref={layer} className={styles.layer} hidden aria-hidden="true" data-pwa-opening>
    <div className={styles.brand}>
      <div className={styles.medallion}><span className={styles.symbol} /></div>
      <span className={styles.wordmark} />
      <span className={styles.accent} />
    </div>
  </div>
}
