'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { CalendarDays, Crown, Sparkles, Trophy, UsersRound } from 'lucide-react'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import PampraxHero from '@/components/ui/PampraxHero'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { formatRankingGender, formatRankingPoints, normalizeRankingGender } from '@/lib/ranking'

export type PublicClubCampaign = {
  id: string
  slotId: string
  title: string
  description: string | null
  imageUrl: string | null
  targetUrl: string | null
  sponsorName: string | null
}

export type PublicClubTournament = {
  id: string
  name: string
  status: string
  type?: string | null
  gender: string
  segment?: string | null
  category: number | null
  startDate: string | null
  endDate?: string | null
  registrationDeadline?: string | null
  pricePerPlayer: number | null
  maxPairs: number | null
  registeredPairs?: number | null
  flyerUrl?: string | null
  rules?: Record<string, unknown> | null
}

export type PublicClubRankingSummary = {
  key: string
  label: string
  gender: string
  players: number
  leaderName: string
  leaderPoints: number
}

export type PublicClubNews = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverUrl: string | null
  featuredRank?: number | null
  publishedAt: string | null
}

type PublicClubHomeProps = {
  club: {
    id: string
    name: string
    city: string | null
    province: string | null
    country: string | null
    logoUrl: string | null
    coverUrl?: string | null
    themeKey: string | null
  }
  stats: {
    players: number
    tournaments: number
    categories: number
  }
  heroCampaign: PublicClubCampaign | null
  campaignsBySlot: Record<string, PublicClubCampaign | null>
  tournaments: PublicClubTournament[]
  rankingSummary: PublicClubRankingSummary[]
  news?: PublicClubNews[]
}

const sponsorSlots = [
  { id: 'HOME_NEWS_LEFT', title: 'Editorial principal', ratio: '6x4' },
  { id: 'HOME_NEWS_RIGHT', title: 'Editorial lateral', ratio: '6x4' },
  { id: 'HOME_CALENDAR_INLINE', title: 'Calendario inline', ratio: '6x2' },
  { id: 'HOME_FOOTER_STRIP', title: 'Banner inferior', ratio: '12x2' },
] as const

function formatDate(value?: string | null) {
  if (!value) return 'Fecha a confirmar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha a confirmar'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date).replace('.', '')
}

function dateParts(value?: string | null) {
  if (!value) return { day: '--', month: 'Fecha', year: 'A definir' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '--', month: 'Fecha', year: 'A definir' }
  return {
    day: new Intl.DateTimeFormat('es-AR', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(date).replace('.', ''),
    year: new Intl.DateTimeFormat('es-AR', { year: 'numeric' }).format(date),
  }
}

function CampaignSlot({
  campaign,
  title,
  ratio,
  hero = false,
}: {
  campaign: PublicClubCampaign | null
  title: string
  ratio: string
  hero?: boolean
}) {
  const image = buildAssetProxyUrl(campaign?.imageUrl)
  const body = (
    <>
      {image ? <img src={image} alt={campaign?.title ?? title} /> : null}
      <div className="clubPublicAdBody">
        <span>{title}</span>
        <strong>{campaign?.title ?? 'Este espacio puede ser tuyo'}</strong>
        <p>{campaign?.description ?? 'Presencia comercial premium dentro de la actividad pública del club.'}</p>
        <em>{campaign?.sponsorName ?? `Formato ${ratio} · Disponible`}</em>
      </div>
    </>
  )

  if (campaign?.targetUrl) {
    return (
      <a className={`clubPublicAd ${hero ? 'is-hero' : ''} ${image ? 'has-image' : ''}`} href={campaign.targetUrl} target="_blank" rel="noreferrer">
        {body}
      </a>
    )
  }

  return <div className={`clubPublicAd ${hero ? 'is-hero' : ''} ${image ? 'has-image' : ''}`}>{body}</div>
}

function SectionTitle({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="clubPublicSectionTitle">
      <div>
        <span className="PampraxAccentBar" aria-hidden="true" />
        <small>{kicker}</small>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

export default function PublicClubHomeExperience({
  club,
  stats,
  heroCampaign,
  campaignsBySlot,
  tournaments,
  rankingSummary,
  news = [],
}: PublicClubHomeProps) {
  const theme = getClubTheme(club.themeKey)
  const location = [club.city, club.province].filter(Boolean).join(' · ') || club.country || 'Club Pamprax'
  const featuredNews = news.length
    ? news.slice(0, 3).map((item) => ({
      title: item.title,
      excerpt: item.excerpt || 'Novedad publicada por el club.',
      date: formatDate(item.publishedAt),
      coverUrl: item.coverUrl,
      href: `/noticias/${item.slug}`,
    }))
    : [
      {
        title: `La actividad de ${club.name} se prepara para una nueva etapa`,
        excerpt: 'Torneos, ranking y comunidad deportiva reunidos en una home pública pensada para seguir el movimiento del club.',
        date: 'Actualidad',
        coverUrl: null,
        href: null,
      },
      {
        title: 'Noticias propias del club',
        excerpt: 'Cuando el club publique novedades, comunicados o contenido editorial, van a aparecer en este espacio.',
        date: 'Próximamente',
        coverUrl: null,
        href: null,
      },
      {
        title: 'Historias de jugadores y torneos',
        excerpt: 'La cobertura del circuito interno quedará integrada con la identidad visual del club.',
        date: 'Pamprax',
        coverUrl: null,
        href: null,
      },
    ]
  const visibleTournaments = [...tournaments]
    .sort((a, b) => {
      const byStatus = getTournamentDisplayStatus(a).priority - getTournamentDisplayStatus(b).priority
      if (byStatus !== 0) return byStatus
      return new Date(a.startDate ?? '2999-12-31').getTime() - new Date(b.startDate ?? '2999-12-31').getTime()
    })
    .slice(0, 4)
  const style = {
    ['--club-accent' as string]: theme.vars.accent,
    ['--club-accent-2' as string]: theme.vars.accent2,
    ['--club-glow' as string]: theme.vars.glow,
    ['--club-soft' as string]: theme.vars.soft,
    ['--club-hero' as string]: theme.vars.hero,
  } as CSSProperties

  return (
    <main className="clubPublicHome" style={style}>
      <PampraxHero
        kicker="Home pública del club"
        title={club.name}
        subtitle={location}
        primaryAction={{ label: 'Ver ranking', href: '/ranking' }}
        secondaryAction={{ label: 'Ver torneos', href: '/torneos' }}
        logo={{ src: club.logoUrl, fallback: club.name.slice(0, 2).toUpperCase(), alt: club.name }}
        stats={[
          { label: 'jugadores', value: stats.players, icon: <UsersRound size={15} /> },
          { label: 'torneos', value: stats.tournaments, icon: <Trophy size={15} /> },
          { label: 'categorías', value: stats.categories, icon: <Crown size={15} /> },
        ]}
        themeKey={club.themeKey}
        coverUrl={club.coverUrl}
      />

      <section>
        <SectionTitle
          kicker="Agenda competitiva"
          title="Torneos activos y próximos"
          action={<Link className="clubPublicSectionLink" href="/torneos">Ver calendario</Link>}
        />
        <div className="clubPublicTournamentGrid">
          {visibleTournaments.length ? visibleTournaments.map((tournament) => (
            <TournamentPublicCard
              key={tournament.id}
              tournament={{
                ...tournament,
                clubName: club.name,
                clubLogoUrl: club.logoUrl,
                clubThemeKey: club.themeKey,
              }}
            />
          )) : (
            <div className="clubPublicEmpty">
              <CalendarDays size={24} />
              <strong>Sin torneos próximos</strong>
              <p>Cuando el club publique nuevos torneos, van a aparecer en esta agenda.</p>
            </div>
          )}
        </div>
      </section>

      <section className="clubPublicFeaturedAd">
        <CampaignSlot campaign={heroCampaign} title="Publicitá en este club" ratio="6x3" hero />
      </section>

      <section className="clubPublicNewsSection">
        <SectionTitle kicker="Noticias del club" title="Actualidad deportiva" />
        <div className="clubPublicNewsGrid">
          {featuredNews.map((item, index) => {
            const card = (
              <article className={`clubPublicNewsCard ${index === 0 ? 'is-featured' : ''}`}>
                {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className="clubPublicNewsImage" /> : <div className="clubPublicNewsVisual" aria-hidden="true" />}
              <div className="clubPublicNewsOverlay">
                <span className="clubPublicNewsBadge"><i />{club.name}</span>
                <time>{item.date}</time>
                <strong>{item.title}</strong>
                <p>{item.excerpt}</p>
                <span className="clubPublicNewsCta">Leer nota completa</span>
              </div>
            </article>
            )
            return item.href ? (
              <Link className={`clubPublicNewsLink ${index === 0 ? 'is-featured' : ''}`} href={item.href} key={item.title}>
                {card}
              </Link>
            ) : (
              <div className={`clubPublicNewsLink ${index === 0 ? 'is-featured' : ''}`} key={item.title}>
                {card}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          kicker="Ranking del club"
          title="Categorías y ramas activas"
          action={<Link className="clubPublicSectionLink" href="/ranking">Ver ranking completo</Link>}
        />
        <div className="clubPublicRankingGrid">
          {rankingSummary.length ? rankingSummary.map((item) => (
            <article className={`clubPublicRankingCard clubPublicRankingCard--${normalizeRankingGender(item.gender) === 'F' ? 'magenta' : 'cyan'}`} key={item.key}>
              <span>{formatRankingGender(item.gender)}</span>
              <h3>{item.label}</h3>
              <p>{item.players} jugadores</p>
              <div>
                <em>Líder</em>
                <strong>{item.leaderName}</strong>
                <small>{formatRankingPoints(item.leaderPoints)}</small>
              </div>
            </article>
          )) : (
            <div className="clubPublicEmpty">
              <Sparkles size={24} />
              <strong>Ranking en preparación</strong>
              <p>Faltan jugadores aprobados o puntos registrados para mostrar el resumen público.</p>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle kicker="Sponsors y publicidad" title="Espacios comerciales del club" />
        <div className="clubPublicSponsorGrid">
          {sponsorSlots.map((slot) => (
            <CampaignSlot
              key={slot.id}
              campaign={campaignsBySlot[slot.id] ?? null}
              title={slot.title}
              ratio={slot.ratio}
            />
          ))}
        </div>
      </section>
    </main>
  )
}
