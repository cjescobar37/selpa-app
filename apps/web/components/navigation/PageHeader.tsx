import type { ReactNode } from 'react'
import PageBackAction from './PageBackAction'
import styles from './PageHeader.module.css'

/** Back navigation shares the title row, never a separate strip above the page. */
export default function PageHeader({ title, eyebrow, description, backHref, backLabel,
  actions, meta, tone = 'light' }: {
  title: ReactNode; eyebrow?: ReactNode; description?: ReactNode; backHref?: string;
  backLabel?: string; actions?: ReactNode; meta?: ReactNode; tone?: 'light' | 'dark'
}) {
  return <header className={`${styles.header} ${tone === 'dark' ? styles.dark : ''}`}>
    <div className={styles.identity}>
      {backHref ? <PageBackAction href={backHref} label={backLabel} tone={tone} /> : null}
      <div className={styles.copy}>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
    {actions ? <div className={styles.actions}>{actions}</div> : null}
    {meta ? <div className={styles.meta}>{meta}</div> : null}
  </header>
}
