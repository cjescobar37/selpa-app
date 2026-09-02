'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'

type PampraxHeroAction = {
  label: string
  href?: string
  onClick?: () => void
}

type PampraxHeroLogo = {
  src?: string | null
  alt?: string
  fallback?: string
}

type PampraxHeroStat = {
  label: string
  value: string | number
  icon?: ReactNode
}

type PampraxHeroBadge = {
  label: string
  tone?: 'success' | 'warning' | 'info'
}

export type PampraxHeroProps = {
  kicker?: string
  mobileKicker?: string
  title: string
  subtitle?: string
  mobileSubtitle?: string
  primaryAction?: PampraxHeroAction
  secondaryAction?: PampraxHeroAction
  logo?: PampraxHeroLogo
  stats?: PampraxHeroStat[]
  mobileStats?: PampraxHeroStat[]
  mobilePrimaryAction?: PampraxHeroAction
  statusBadge?: PampraxHeroBadge
  mobileStatusBadge?: PampraxHeroBadge
  themeKey?: string | null
  coverUrl?: string | null
  variant?: 'default' | 'player-tournament'
}

function renderAction(action: PampraxHeroAction | undefined, className: string) {
  if (!action) return null
  if (action.href) {
    return (
      <Link className={className} href={action.href}>
        {action.label}
      </Link>
    )
  }

  return (
    <button className={className} type="button" onClick={action.onClick}>
      {action.label}
    </button>
  )
}

export default function PampraxHero({
  kicker,
  mobileKicker,
  title,
  subtitle,
  mobileSubtitle,
  primaryAction,
  secondaryAction,
  logo,
  stats,
  mobileStats,
  mobilePrimaryAction,
  statusBadge,
  mobileStatusBadge,
  themeKey,
  coverUrl,
  variant = 'default',
}: PampraxHeroProps) {
  const theme = getClubTheme(themeKey)
  const cover = buildAssetProxyUrl(coverUrl)
  const logoSrc = buildAssetProxyUrl(logo?.src)
  const hasActions = Boolean(primaryAction || secondaryAction || mobilePrimaryAction || statusBadge || mobileStatusBadge)
  const style = {
    ['--pamprax-hero-accent' as string]: theme.vars.accent,
    ['--pamprax-hero-accent-2' as string]: theme.vars.accent2,
    ['--pamprax-hero-glow' as string]: theme.vars.glow,
    ['--pamprax-hero-soft' as string]: theme.vars.soft,
    ['--pamprax-hero-gradient' as string]: themeKey ? theme.vars.hero : 'rgba(2,6,23,1) 0%, rgba(6,27,58,.98) 58%, rgba(7,20,38,.98) 100%',
    ['--pamprax-hero-cover' as string]: cover ? `url("${cover}")` : undefined,
    ['--pamprax-hero-logo' as string]: logoSrc ? `url("${logoSrc}")` : undefined,
  } as CSSProperties

  return (
    <section className={`pampraxHero ${cover ? 'has-cover' : ''} ${logo ? 'has-identity-logo' : ''} ${mobileKicker ? 'has-mobile-kicker' : ''} ${mobileSubtitle ? 'has-mobile-subtitle' : ''} ${mobileStats?.length ? 'has-mobile-stats' : ''} ${mobileStatusBadge ? 'has-mobile-status' : ''} ${variant === 'player-tournament' ? 'is-player-tournament' : ''}`} style={style}>
      <div className="pampraxHero__texture" aria-hidden="true" />
      <div className={`pampraxHero__body ${logo ? 'has-logo' : ''}`}>
        {logo ? (
          <div className={`pampraxHero__logo ${logoSrc ? 'has-image' : ''}`} aria-label={logo.alt} aria-hidden={!logo.alt}>
            {logoSrc ? null : logo.fallback}
          </div>
        ) : null}
        <div className="pampraxHero__text">
          {kicker ? <span className="pampraxHero__kicker--default">{kicker}</span> : null}
          {mobileKicker ? <span className="pampraxHero__onlyMobile">{mobileKicker}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <p className="pampraxHero__subtitle--default">{subtitle}</p> : null}
          {mobileSubtitle ? <p className="pampraxHero__onlyMobile">{mobileSubtitle}</p> : null}
          {stats?.length ? (
            <div className="pampraxHero__stats">
              {stats.map((stat) => (
                <em key={`${stat.label}:${stat.value}`}>
                  {stat.icon}
                  <span>{stat.label}:</span>
                  <strong>{stat.value}</strong>
                </em>
              ))}
            </div>
          ) : null}
          {mobileStats?.length ? (
            <div className="pampraxHero__stats pampraxHero__stats--mobile">
              {mobileStats.map((stat) => (
                <em key={`mobile:${stat.label}:${stat.value}`}>
                  {stat.icon}
                  <span>{stat.label}:</span>
                  <strong>{stat.value}</strong>
                </em>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {hasActions ? (
        <div className="pampraxHero__actions">
          {statusBadge ? (
            <div className={`pampraxHero__statusBadge pampraxHero__statusBadge--default is-${statusBadge.tone ?? 'info'}`}>
              <span />
              {statusBadge.label}
            </div>
          ) : null}
          {mobileStatusBadge ? (
            <div className={`pampraxHero__statusBadge pampraxHero__onlyMobile is-${mobileStatusBadge.tone ?? 'info'}`}>
              <span />
              {mobileStatusBadge.label}
            </div>
          ) : null}
          {renderAction(primaryAction, 'pampraxHero__action pampraxHero__action--primary')}
          {renderAction(mobilePrimaryAction, 'pampraxHero__action pampraxHero__action--primary pampraxHero__action--mobileOnly')}
          {renderAction(secondaryAction, 'pampraxHero__action pampraxHero__action--secondary')}
        </div>
      ) : null}
    </section>
  )
}
