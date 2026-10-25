import type { ReactNode } from 'react'
import PageBackAction from './PageBackAction'
import styles from './PageHeader.module.css'

/** Back navigation shares the title row, never a separate strip above the page. */
export default function PageHeader({ title, eyebrow, description, backHref, backLabel,
  actions, meta, tone = 'light', legacyClassName, fullBleedMobile = true }: {
  title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; backHref?: string;
  backLabel?: string; actions?: ReactNode; meta?: ReactNode; tone?: 'light' | 'dark'; legacyClassName?: string; fullBleedMobile?: boolean
}) {
  return <header data-selpa-page-header className={`${legacyClassName ? `${legacyClassName} ${styles.legacy}` : `${styles.header} ${tone === 'dark' ? styles.dark : ''}`} ${styles.mobileCanonical} ${fullBleedMobile ? styles.fullBleed : ''}`}>
    <div className={styles.identity}>
      {backHref ? <PageBackAction href={backHref} label={backLabel} tone={tone} /> : null}
      <div className={styles.copy}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : <span className={`${styles.eyebrow} ${styles.mobileOnly}`}>SELPA</span>}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
    {meta ? <div className={styles.meta}>{meta}</div> : null}
  </header>
}
