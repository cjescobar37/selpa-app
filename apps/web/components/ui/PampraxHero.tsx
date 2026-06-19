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
  title: string
  subtitle?: string
  primaryAction?: PampraxHeroAction
  secondaryAction?: PampraxHeroAction
  logo?: PampraxHeroLogo
  stats?: PampraxHeroStat[]
  statusBadge?: PampraxHeroBadge
  themeKey?: string | null
  coverUrl?: string | null
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
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  logo,
  stats,
  statusBadge,
  themeKey,
  coverUrl,
}: PampraxHeroProps) {
  const theme = getClubTheme(themeKey)
  const cover = buildAssetProxyUrl(coverUrl)
  const logoSrc = buildAssetProxyUrl(logo?.src)
  const hasActions = Boolean(primaryAction || secondaryAction || statusBadge)
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
    <section className={`pampraxHero ${cover ? 'has-cover' : ''} ${logo ? 'has-identity-logo' : ''}`} style={style}>
      <div className="pampraxHero__texture" aria-hidden="true" />
      <div className={`pampraxHero__body ${logo ? 'has-logo' : ''}`}>
        {logo ? (
          <div className={`pampraxHero__logo ${logoSrc ? 'has-image' : ''}`} aria-label={logo.alt} aria-hidden={!logo.alt}>
            {logoSrc ? null : logo.fallback}
          </div>
        ) : null}
        <div className="pampraxHero__text">
          {kicker ? <span>{kicker}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
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
        </div>
      </div>
      {hasActions ? (
        <div className="pampraxHero__actions">
          {statusBadge ? (
            <div className={`pampraxHero__statusBadge is-${statusBadge.tone ?? 'info'}`}>
              <span />
              {statusBadge.label}
            </div>
          ) : null}
          {renderAction(primaryAction, 'pampraxHero__action pampraxHero__action--primary')}
          {renderAction(secondaryAction, 'pampraxHero__action pampraxHero__action--secondary')}
        </div>
      ) : null}
    </section>
  )
}
