import type { ReactNode } from 'react'
import headerStyles from '@/components/navigation/PageHeader.module.css'

export default function PlayerSectionHero({ badge, title, description, icon, action }: {
  badge: string
  title: string
  description: ReactNode
  icon?: ReactNode
  action?: ReactNode
}) {
  return <section data-selpa-page-header className={`playerSectionHero ${headerStyles.mobileCanonical} ${headerStyles.fullBleed}`}>
    <div className="playerSectionHero__copy">
      <span className={headerStyles.eyebrow}>{badge}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {action ? <div className="playerSectionHero__action">{action}</div> : icon ? <i className="playerSectionHero__icon" aria-hidden="true">{icon}</i> : null}
  </section>
}
