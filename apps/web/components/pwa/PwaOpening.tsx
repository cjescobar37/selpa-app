import type { CSSProperties } from 'react'
import { PWA_OPENING } from '@/lib/pwaOpening'
import styles from './PwaOpening.module.css'

/** Server-rendered first frame. The head bootstrap owns activation and exit. */
export default function PwaOpening({ artwork }: { artwork: { symbol: string; wordmark: string } }) {
  const geometry = {
    '--opening-background': PWA_OPENING.background,
    '--opening-medallion': `${PWA_OPENING.medallion}px`, '--opening-symbol': `${PWA_OPENING.symbol}px`,
    '--opening-wordmark-width': `${PWA_OPENING.wordmarkWidth}px`, '--opening-wordmark-height': `${PWA_OPENING.wordmarkHeight}px`,
    '--opening-gap': `${PWA_OPENING.gap}px`, '--opening-accent-width': `${PWA_OPENING.accentWidth}px`, '--opening-accent-height': `${PWA_OPENING.accentHeight}px`,
  } as CSSProperties
  return <div className={styles.layer} style={geometry} aria-hidden="true" data-pwa-opening>
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
