import type { ReactNode } from 'react'
import headerStyles from '@/components/navigation/PageHeader.module.css'
import PageBackAction from '@/components/navigation/PageBackAction'

export default function PlayerSectionHero({ badge, title, description, icon, action, backHref }: {
  badge: string
  title: string
  description: ReactNode
  icon?: ReactNode
  action?: ReactNode
  backHref?: string
}) {
  return <section data-selpa-page-header className={`playerSectionHero ${headerStyles.mobileCanonical} ${headerStyles.fullBleed}`} style={backHref?{display:'grid',gridTemplateColumns:'44px minmax(0,1fr) auto',gap:10}:undefined}>
    {backHref?<PageBackAction href={backHref} tone="dark" />:null}
    <div className="playerSectionHero__copy">
      <span className={headerStyles.eyebrow}>{badge}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {action ? <div className="playerSectionHero__action">{action}</div> : icon ? <i className="playerSectionHero__icon" aria-hidden="true">{icon}</i> : null}
  </section>
}
