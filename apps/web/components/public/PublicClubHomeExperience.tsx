'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, Crown, Sparkles, Trophy, UsersRound } from 'lucide-react'
import { buildAssetProxyUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { BRAND } from '@/lib/branding'
import PampraxHero from '@/components/ui/PampraxHero'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { formatRankingPoints, normalizeRankingGender } from '@/lib/ranking'

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
  leaderPhotoUrl?: string | null
  partnerName?: string | null
  partnerPhotoUrl?: string | null
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

const PLACEHOLDER_TEXT = new Set(['adsasd', 'sdfsf', 'asdf', 'asdasd', 'test', 'testing', 'prueba', 'lorem', 'demo'])

function validExternalUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function hasMeaningfulCommercialText(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.length < 3) return false
  if (PLACEHOLDER_TEXT.has(normalized)) return false
  if (/^(.)\1{2,}$/.test(normalized)) return false
  return true
}

function sponsorInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'SP'
}

function playerInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'SE'
}

function formatClubRankingBranch(value?: string | null) {
  const normalized = normalizeRankingGender(value)
  if (normalized === 'M') return 'Caballeros'
  if (normalized === 'F') return 'Damas'
  if (normalized === 'MIXED') return 'Mixto'
  return 'Rama por definir'
}

function rankingBranchTone(value?: string | null) {
  const normalized = normalizeRankingGender(value)
  if (normalized === 'F') return 'magenta'
  if (normalized === 'MIXED') return 'mixed'
  if (normalized === 'M') return 'cyan'
  return 'neutral'
}

function rankingBranchOrder(value?: string | null) {
  const normalized = normalizeRankingGender(value)
  if (normalized === 'M') return 1
  if (normalized === 'F') return 2
  if (normalized === 'MIXED') return 3
  return 4
}

function demoRankingCategory(label = '6ta'): { label: string; isDemo: true; branches: PublicClubRankingSummary[] } {
  return {
    label,
    isDemo: true,
    branches: [
    {
      key: `demo-${label}-caballeros`,
      label,
      gender: 'M',
      players: 42,
      leaderName: 'Joaquín Pereyra',
      partnerName: 'Marcos Díaz',
      leaderPoints: 1280,
    },
    {
      key: `demo-${label}-damas`,
      label,
      gender: 'F',
      players: 36,
      leaderName: 'Lucía Galarza',
      partnerName: 'Sofía Núñez',
      leaderPoints: 1215,
    },
  ],
  }
}

function mergeDemoBranches(realGroup: { label: string; isDemo: boolean; branches: PublicClubRankingSummary[] }) {
  const demoGroup = demoRankingCategory(realGroup.label)
  const byGender = new Map<string, PublicClubRankingSummary>()
  for (const branch of demoGroup.branches) byGender.set(normalizeRankingGender(branch.gender), branch)
  for (const branch of realGroup.branches) byGender.set(normalizeRankingGender(branch.gender), branch)
  return {
    ...realGroup,
    isDemo: true,
    branches: Array.from(byGender.values()).sort((current, next) => rankingBranchOrder(current.gender) - rankingBranchOrder(next.gender)).slice(0, 2),
  }
}

function splitPlayerName(value?: string | null) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { first: 'Por', last: 'confirmar' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

function rankingCategoryHref(clubId: string, categoryLabel: string) {
  const category = categoryLabel.match(/\d+/)?.[0]
  const params = new URLSearchParams({ clubId })
  if (category) params.set('category', category)
  return `/ranking?${params.toString()}`
}

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
  const targetUrl = validExternalUrl(campaign?.targetUrl)
  const badge = campaign ? 'Publicidad en este club' : 'Espacio disponible'
  const meta = campaign?.sponsorName ?? `Formato ${ratio} · Disponible`
  const body = (
    <>
      {image ? <img src={image} alt={campaign?.title ?? title} /> : null}
      <div className="clubPublicAdBody">
        <span>{badge}</span>
        <strong>{campaign?.title ?? 'Este espacio puede ser tuyo'}</strong>
        <p>{campaign?.description ?? 'Presencia comercial premium dentro de la actividad pública del club.'}</p>
        <em>{targetUrl ? <>Conocer más <b aria-hidden="true">→</b></> : meta}</em>
      </div>
    </>
  )
  const className = `clubPublicAd ${hero ? 'is-hero' : ''} ${image ? 'has-image' : ''} ${campaign ? 'has-campaign' : 'is-empty'}`

  if (targetUrl) {
    return (
      <a className={className} href={targetUrl} target="_blank" rel="noreferrer">
        {body}
      </a>
    )
  }

  return <div className={className}>{body}</div>
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
  const location = [club.city, club.province].filter(Boolean).join(' · ') || club.country || `Club ${BRAND.name}`
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
        date: BRAND.name,
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
  const rankingCategories = useMemo(() => {
    const groups = new Map<string, { label: string; branches: PublicClubRankingSummary[] }>()
    for (const item of rankingSummary) {
      const key = item.label || 'Categoría por definir'
      const current = groups.get(key) ?? { label: key, branches: [] }
      current.branches.push(item)
      groups.set(key, current)
    }
    const realGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        isDemo: false,
        branches: group.branches
          .sort((current, next) => rankingBranchOrder(current.gender) - rankingBranchOrder(next.gender))
          .slice(0, 2),
      }))

    const hasCompleteRealCategory = realGroups.some((group) => {
      const genders = new Set(group.branches.map((branch) => normalizeRankingGender(branch.gender)))
      return genders.has('M') && genders.has('F')
    })

    const groupsForDisplay = hasCompleteRealCategory
      ? realGroups
      : realGroups.length
        ? [mergeDemoBranches(realGroups[0]), ...realGroups.slice(1)]
        : [demoRankingCategory()]
    return groupsForDisplay
      .slice(0, 6)
  }, [rankingSummary])
  const sponsorCampaigns = useMemo(() => {
    return sponsorSlots
      .map((slot) => {
        const campaign = campaignsBySlot[slot.id] ?? null
        if (!campaign) {
          return {
            id: `available-${slot.id}`,
            displayTitle: 'Este espacio puede ser tuyo',
            displayDescription: `Formato ${slot.ratio} disponible para marcas del club.`,
            displayImage: null,
            displayUrl: null,
            isPlaceholder: true,
          }
        }
        const title = hasMeaningfulCommercialText(campaign.sponsorName) ? campaign.sponsorName! : campaign.title
        if (!hasMeaningfulCommercialText(title)) {
          return {
            id: `available-${slot.id}`,
            displayTitle: 'Este espacio puede ser tuyo',
            displayDescription: `Formato ${slot.ratio} disponible para marcas del club.`,
            displayImage: null,
            displayUrl: null,
            isPlaceholder: true,
          }
        }
        return {
          id: campaign.id,
          displayTitle: title.trim(),
          displayDescription: hasMeaningfulCommercialText(campaign.description) ? campaign.description?.trim() ?? null : null,
          displayImage: buildAssetProxyUrl(campaign.imageUrl),
          displayUrl: validExternalUrl(campaign.targetUrl),
          isPlaceholder: false,
        }
      })
      .slice(0, 8)
  }, [campaignsBySlot])
  const [isSponsorCarouselPaused, setIsSponsorCarouselPaused] = useState(false)
  const sponsorCarouselRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sponsorCampaigns.length || isSponsorCarouselPaused) return
    const carousel = sponsorCarouselRef.current
    if (!carousel) return
    const interval = window.setInterval(() => {
      const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth
      if (maxScrollLeft <= 0) return
      const nextScrollLeft = carousel.scrollLeft + Math.min(280, carousel.clientWidth * 0.72)
      carousel.scrollTo({
        left: nextScrollLeft >= maxScrollLeft - 8 ? 0 : nextScrollLeft,
        behavior: 'smooth',
      })
    }, 4200)
    return () => window.clearInterval(interval)
  }, [isSponsorCarouselPaused, sponsorCampaigns.length])
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

      <section>
        <SectionTitle
          kicker="Ranking del club"
          title="Los números 1 del club por categoría"
          action={<Link className="clubPublicSectionLink" href={`/ranking?clubId=${club.id}`}>Ver todos los rankings</Link>}
        />
        <div className="clubPublicRankingGrid">
          {rankingCategories.length ? rankingCategories.map((category) => (
            <Link
              className={`clubPublicRankingCard ${category.isDemo ? 'is-demo' : ''}`}
              href={rankingCategoryHref(club.id, category.label)}
              key={`${category.isDemo ? 'demo' : 'real'}-${category.label}`}
              aria-label={`Ver ranking de ${club.name} en ${category.label}`}
            >
              <div className="clubPublicRankingCategoryHead">
                <small>Categoría</small>
                <span>{category.label}</span>
                {category.isDemo ? <small className="is-demo-label">Vista demo</small> : null}
              </div>
              <div className={`clubPublicRankingBranches ${category.branches.length === 1 ? 'is-single' : ''}`}>
                {category.branches.map((item) => {
                  const branchTone = rankingBranchTone(item.gender)
                  const hasLeader = Boolean(item.leaderName && item.leaderName.trim())
                  const leaderName = hasLeader ? item.leaderName : 'Ranking en formación'
                  const partnerName = item.partnerName?.trim() || null
                  const branchLabel = formatClubRankingBranch(item.gender)
                  const leaderParts = splitPlayerName(leaderName)
                  const partnerParts = splitPlayerName(partnerName)
                  return (
                    <div className={`clubPublicRankingBranch is-${branchTone}`} key={item.key}>
                      <div className="clubPublicRankingBranchTop">
                        <span>{branchLabel}</span>
                        <b><i>#1</i><em>{formatRankingPoints(item.leaderPoints)}</em></b>
                      </div>
                      <div className="clubPublicRankingPair">
                        <div className="clubPublicRankingPlayer">
                          <RankingAvatar name={hasLeader ? leaderName : null} photoUrl={item.leaderPhotoUrl} tone={branchTone} />
                          <strong><span>{leaderParts.first}</span><span>{leaderParts.last}</span></strong>
                        </div>
                        {partnerName || item.partnerPhotoUrl ? (
                          <div className="clubPublicRankingPlayer">
                            <RankingAvatar name={partnerName} photoUrl={item.partnerPhotoUrl} fallback="P2" tone={branchTone} secondary />
                            <strong><span>{partnerParts.first}</span><span>{partnerParts.last}</span></strong>
                          </div>
                        ) : (
                          <div className="clubPublicRankingPlayer is-pending">
                            <RankingAvatar name={null} photoUrl={null} fallback="P2" tone="neutral" secondary />
                            <span>Pareja por confirmar</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="clubPublicRankingFooter">
                Ver ranking completo de {category.label} <span aria-hidden="true">→</span>
              </div>
            </Link>
          )) : (
            <div className="clubPublicEmpty">
              <Sparkles size={24} />
              <strong>Ranking en preparación</strong>
              <p>Faltan jugadores aprobados o puntos registrados para mostrar el resumen público.</p>
            </div>
          )}
        </div>
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

      <section className="clubPublicSponsorsPanel" aria-label="Sponsors del club">
        <div className="clubPublicSponsorsIntro">
          <span>Marcas que acompañan {club.name}</span>
          <h2>Aliados que impulsan la comunidad.</h2>
          <p>Sponsors y marcas presentes en la actividad pública del club.</p>
          <button type="button">Conocé los aliados</button>
        </div>
        <div
          className="clubPublicSponsorCarousel"
          ref={sponsorCarouselRef}
          onMouseEnter={() => setIsSponsorCarouselPaused(true)}
          onMouseLeave={() => setIsSponsorCarouselPaused(false)}
          onFocus={() => setIsSponsorCarouselPaused(true)}
          onBlur={() => setIsSponsorCarouselPaused(false)}
          onPointerDown={() => setIsSponsorCarouselPaused(true)}
          onPointerUp={() => setIsSponsorCarouselPaused(false)}
        >
          {sponsorCampaigns.map((item, index) => {
            const badge = item.isPlaceholder ? 'Espacio disponible' : index === 0 ? 'Sponsor principal' : 'Sponsor oficial'
            const content = (
              <>
                <span className="clubPublicSponsorBadge">{badge}</span>
                <span className={`clubPublicSponsorLogo ${item.displayImage ? 'has-image' : ''}`}>
                  {item.displayImage ? <img src={item.displayImage} alt="" loading="lazy" decoding="async" /> : sponsorInitials(item.displayTitle)}
                </span>
                <span className="clubPublicSponsorBody">
                  <strong>{item.displayTitle}</strong>
                  {item.displayDescription ? <p>{item.displayDescription}</p> : null}
                  {item.displayUrl ? <em>Conocer más <b aria-hidden="true">→</b></em> : null}
                </span>
              </>
            )
            return item.displayUrl ? (
              <a className="clubPublicSponsorCard" href={item.displayUrl} target="_blank" rel="noreferrer" key={item.id}>
                {content}
              </a>
            ) : (
              <article className="clubPublicSponsorCard" key={item.id}>
                {content}
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function RankingAvatar({
  name,
  photoUrl,
  fallback = 'SE',
  tone = 'cyan',
  secondary = false,
}: {
  name?: string | null
  photoUrl?: string | null
  fallback?: string
  tone?: string
  secondary?: boolean
}) {
  const image = buildAssetProxyUrl(photoUrl)
  const label = name?.trim() || fallback
  return (
    <span className={`clubPublicRankingAvatar is-${tone} ${secondary ? 'is-secondary' : ''} ${image ? 'has-image' : ''}`}>
      {image ? <img src={image} alt={label} loading="lazy" decoding="async" /> : playerInitials(label)}
    </span>
  )
}
