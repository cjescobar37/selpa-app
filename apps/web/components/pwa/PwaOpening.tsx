'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { PWA_OPENING } from '@/lib/pwaOpening'
import styles from './PwaOpening.module.css'

type OpeningState = { active: boolean; started: number; finish: () => void; onFinish?: () => void }

/** SSR first frame. The effect can only dismiss, never reveal a late overlay. */
export default function PwaOpening({ artwork }: { artwork: { symbol: string; wordmark: string } }) {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = layer.current
    const boot = (window as Window & { __selpaOpening?: OpeningState }).__selpaOpening
    if (!element || !boot?.active) return
    const content = document.querySelector('main')
    let leaving = false
    let removal: ReturnType<typeof setTimeout> | undefined
    const ready = () => Boolean(content?.querySelector('h1')) && !content?.matches('[aria-busy="true"]') && !content?.querySelector('[aria-busy="true"]')
    const observer = new MutationObserver(() => { if (ready()) leave() })
    function clean() { clearTimeout(removal); observer.disconnect(); element!.hidden = true }
    function leave() {
      if (leaving || !boot!.active) return
      leaving = true
      observer.disconnect()
      // If the CSS safety exit has begun, continue it rather than resetting
      // opacity to1 when hydration lands near the deadline.
      if (Number(getComputedStyle(element!).opacity) >= .999) element!.dataset.phase = 'leaving'
      removal = setTimeout(boot!.finish, Math.min(PWA_OPENING.exitMs, Math.max(0, PWA_OPENING.maxMs - (performance.now() - boot!.started))))
    }
    boot.onFinish = clean
    if (ready()) leave()
    else if (content) observer.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] })
    return () => { boot.finish(); clean(); boot.onFinish = undefined }
  }, [])

  const geometry = {
    '--opening-background': PWA_OPENING.background,
    '--opening-medallion': `${PWA_OPENING.medallion}px`, '--opening-symbol': `${PWA_OPENING.symbol}px`,
    '--opening-wordmark-width': `${PWA_OPENING.wordmarkWidth}px`, '--opening-wordmark-height': `${PWA_OPENING.wordmarkHeight}px`,
    '--opening-gap': `${PWA_OPENING.gap}px`, '--opening-accent-width': `${PWA_OPENING.accentWidth}px`, '--opening-accent-height': `${PWA_OPENING.accentHeight}px`,
  } as CSSProperties
  return <div ref={layer} className={styles.layer} style={geometry} aria-hidden="true" data-pwa-opening>
    <div className={styles.brand}>
      <div className={styles.medallion}>
        {/* eslint-disable-next-line @next/next/no-img-element -- original inline artwork, available in SSR before hydration */}
        <img className={styles.symbol} src={artwork.symbol} width={PWA_OPENING.symbol} height={PWA_OPENING.symbol} alt="" decoding="sync" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- original inline wordmark, no network/decode wait */}
      <img className={styles.wordmark} src={artwork.wordmark} width={PWA_OPENING.wordmarkWidth} height={PWA_OPENING.wordmarkHeight} alt="" decoding="sync" />
      <span className={styles.accent} />
    </div>
  </div>
}
