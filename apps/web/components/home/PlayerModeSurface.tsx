'use client'
import { useId, type ReactNode } from 'react'
import type { HomeMode } from '@/components/ModeSegmentedControl'
import styles from './PlayerModeSurface.module.css'

/** One decorative frame for the entire selected space; never a frame per card. */
export default function PlayerModeSurface({mode,children}:{mode:HomeMode;children:ReactNode}) {
  const id=useId().replaceAll(':','')
  const community=mode==='community'
  return <div className={`homeModePane${community?' is-community':''} ${styles.pane}`} data-player-mode={mode}>
    <span className={styles.rails} aria-hidden="true" />
    <svg key={mode} className={styles.connector} viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id={id}><stop className={styles.start} /><stop offset="1" className={styles.end} /></linearGradient></defs>
      <path d={community?'M 510 0 C 510 25 0 10 0 40 M 992 0 Q 992 20 1000 40':'M 8 0 Q 8 20 0 40 M 490 0 C 490 25 1000 10 1000 40'} stroke={`url(#${id})`} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2" />
    </svg>
    {children}
  </div>
}
