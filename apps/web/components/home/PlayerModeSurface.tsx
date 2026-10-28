'use client'

import type { ReactNode } from 'react'
import type { HomeMode } from '@/components/ModeSegmentedControl'
import styles from './PlayerModeSurface.module.css'

/** The active tab and its contents belong to one softly tinted sheet. */
export default function PlayerModeSurface({ mode, controls, children }: {
  mode: HomeMode
  controls: ReactNode
  children: ReactNode
}) {
  return (
    <div className={styles.surface} data-player-mode={mode}>
      <div className={styles.controls}>{controls}</div>
      <div className={styles.connection} key={mode} aria-hidden="true">
        <span className={styles.stem} />
        <span className={styles.curve} />
      </div>
      <div className={`homeModePane${mode === 'community' ? ' is-community' : ''} ${styles.pane}`}>
        {children}
      </div>
    </div>
  )
}
