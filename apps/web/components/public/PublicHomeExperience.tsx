'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { BRAND } from '@/lib/branding'
import { getClubTheme } from '@/lib/clubThemes'
import { getTournamentDisplayStatus } from '@/lib/tournamentDisplayStatus'
import { normalizePlatformAdRenderConfig } from '@/lib/platformAdConfig'
import ConfigurableAdBanner, { AD_BANNER_DIMENSIONS } from '@/components/ads/ConfigurableAdBanner'
import PampraxHero from '@/components/ui/PampraxHero'
import PublicRankingClubCard from '@/components/public/PublicRankingClubCard'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'
import { useSession } from '@/components/session/SessionProvider'

type NewsItem = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  gallery_urls: string[] | null
  placement: 'HERO' | 'GRID' | 'ARCHIVE'
  published_at: string | null
  updated_at?: string | null
}

type TournamentItem = {
  id: string
  name: string
  status: string
  format: string
  type?: string | null
  gender: string
  segment?: string | null
  category: number | null
  startDate: string | null
  endDate: string | null
  clubName?: string | null
  clubLogoUrl?: string | null
  clubThemeKey?: string | null
  maxPairs?: number | null
  registeredPairs?: number | null
  pricePerPlayer?: number | null
  registrationDeadline?: string | null
  rules?: Record<string, unknown> | null
  flyerUrl?: string | null
}

type AdItem = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  link_url: string | null
  slot: string
  status?: string | null
  starts_at?: string | null
  ends_at?: string | null
  render_config?: unknown
}

type SponsorItem = {
  id: string
  name: string
  description?: string | null
  logo_url: string | null
  website_url: string | null
  tier: string
}

type ClubItem = {
  id: string
  name: string
  city: string | null
  logo_url: string | null
  clubThemeKey?: string | null
  theme_key?: string | null
  players?: number
  categories?: number[]
  malePlayers?: number
  femalePlayers?: number
  tournaments?: number
  activeTournaments?: number
}

type PublicMetrics = {
  clubs: number
  players: number
  tournaments: number
  matches?: number | null
}

function formatDate(value?: string | null) {
  if (!value) return 'Fecha a confirmar'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
}

function placementLabel(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'Última noticia'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Noticia'
}

function newsSourceLabel(item: NewsItem) {
  return String((item as any).club_name ?? (item as any).clubName ?? (item as any).source ?? BRAND.name).toUpperCase()
}

const NEWS_THEME_COLORS: Record<string, { accent: string; accent2: string; glow: string }> = {
  cyan: { accent: '#22d3ee', accent2: '#ec4899', glow: 'rgba(34,211,238,.34)' },
  magenta: { accent: '#ec4899', accent2: '#22d3ee', glow: 'rgba(236,72,153,.32)' },
  indigo: { accent: '#6366f1', accent2: '#22d3ee', glow: 'rgba(99,102,241,.3)' },
  emerald: { accent: '#10b981', accent2: '#22d3ee', glow: 'rgba(16,185,129,.28)' },
  violet: { accent: '#8b5cf6', accent2: '#ec4899', glow: 'rgba(139,92,246,.28)' },
  amber: { accent: '#f59e0b', accent2: '#ec4899', glow: 'rgba(245,158,11,.26)' },
  blueSteel: { accent: '#38bdf8', accent2: '#64748b', glow: 'rgba(56,189,248,.26)' },
  aquaNavy: { accent: '#2dd4bf', accent2: '#38bdf8', glow: 'rgba(45,212,191,.26)' },
  limeNavy: { accent: '#a3e635', accent2: '#22d3ee', glow: 'rgba(163,230,53,.22)' },
  coralNavy: { accent: '#fb7185', accent2: '#22d3ee', glow: 'rgba(251,113,133,.26)' },
  royalCyan: { accent: '#2563eb', accent2: '#22d3ee', glow: 'rgba(37,99,235,.26)' },
  graphiteAqua: { accent: '#14b8a6', accent2: '#94a3b8', glow: 'rgba(20,184,166,.24)' },
  sunsetMagenta: { accent: '#f97316', accent2: '#ec4899', glow: 'rgba(249,115,22,.24)' },
}

function newsThemeStyle(item: NewsItem): CSSProperties {
  const themeKey = String((item as any).theme_key ?? (item as any).themeKey ?? (item as any).club_theme_key ?? 'cyan')
  const theme = NEWS_THEME_COLORS[themeKey] ?? NEWS_THEME_COLORS.cyan
  return {
    ['--news-accent' as string]: theme.accent,
    ['--news-accent-2' as string]: theme.accent2,
    ['--news-glow' as string]: theme.glow,
  }
}

function metricValue(value?: number | null, fallback = '—') {
  if (typeof value !== 'number') return fallback
  return new Intl.NumberFormat('es-AR').format(value)
}

function tournamentSortTime(tournament: TournamentItem) {
  return new Date(tournament.startDate ?? tournament.registrationDeadline ?? '2999-12-31').getTime()
}

function validExternalUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

const PLACEHOLDER_TEXT = new Set(['adsasd', 'sdfsf', 'asdf', 'asdasd', 'test', 'testing', 'prueba', 'lorem', 'demo'])

function hasMeaningfulSponsorText(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.length < 3) return false
  const compact = normalized.replace(/[^a-z0-9áéíóúñ]/gi, '')
  if (PLACEHOLDER_TEXT.has(compact)) return false
  if (/^(.)\1{2,}$/.test(compact)) return false
  return /[a-záéíóúñ0-9]/i.test(compact)
}

function sponsorInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function sponsorBadge(value?: string | null) {
  const label = String(value ?? '').trim()
  if (!label) return 'Sponsor activo'
  return label.replace(/[_-]+/g, ' ')
}

type HomeAdBannerItem = {
  id: string
  title: string
  description?: string | null
  imageUrl: string | null
  url: string | null
  render_config?: unknown
}

function HomeAdBannerSlot({ ads, ariaLabel }: { ads: HomeAdBannerItem[]; ariaLabel: string }) {
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (ads.length <= 1) return
    const carousel = carouselRef.current
    if (!carousel) return

    const interval = window.setInterval(() => {
      const slides = Array.from(carousel.querySelectorAll<HTMLElement>('.px-homeAdBanner'))
      if (!slides.length) return
      const nextIndex = (activeIndex + 1) % slides.length
      carousel.scrollTo({ left: slides[nextIndex].offsetLeft - carousel.offsetLeft, behavior: 'smooth' })
      setActiveIndex(nextIndex)
    }, 6000)

    return () => window.clearInterval(interval)
  }, [activeIndex, ads.length])

  useEffect(() => {
    if (ads.length <= 1) return
    const carousel = carouselRef.current
    if (!carousel) return
    const carouselEl = carousel

    function updateActiveIndex() {
      setActiveIndex(Math.min(ads.length - 1, Math.max(0, Math.round(carouselEl.scrollLeft / Math.max(1, carouselEl.clientWidth)))))
    }

    carouselEl.addEventListener('scroll', updateActiveIndex, { passive: true })
    return () => carouselEl.removeEventListener('scroll', updateActiveIndex)
  }, [ads.length])

  function scrollToAd(index: number) {
    const carousel = carouselRef.current
    const slide = carousel?.querySelectorAll<HTMLElement>('.px-homeAdBanner')[index]
    if (!carousel || !slide) return
    carousel.scrollTo({ left: slide.offsetLeft - carousel.offsetLeft, behavior: 'smooth' })
    setActiveIndex(index)
  }

  if (!ads.length) return null

  return (
    <section className={`px-homeAdBanners ${ads.length === 1 ? 'is-single' : ''}`} aria-label={ariaLabel}>
      <div className="px-homeAdTrack" ref={carouselRef}>
        {ads.map((item) => {
          const image = buildAssetProxyUrl(item.imageUrl)
          const config = normalizePlatformAdRenderConfig(item.render_config)
          if (config.enabled) {
            return (
              <ConfigurableAdBanner
                key={item.id}
                className="px-homeAdBanner px-homeAdBanner--composed"
                config={config}
                description={item.description}
                href={config.buttonUrl || item.url || null}
                imageUrl={image}
                title={item.title}
              />
            )
          }
          const content = (
            <>
              {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : null}
              <span className="px-homeAdBannerOverlay" aria-hidden="true" />
              <span className="px-homeAdBadge">PUBLICIDAD</span>
              <span className="px-homeAdBannerBody">
                <strong>{item.title}</strong>
                {item.url ? <em>Conocer más</em> : null}
              </span>
            </>
          )

          return item.url ? (
            <a className={`px-homeAdBanner ${image ? 'has-image' : ''}`} href={item.url} target="_blank" rel="noreferrer" key={item.id}>
              {content}
            </a>
          ) : (
            <article className={`px-homeAdBanner ${image ? 'has-image' : ''}`} key={item.id}>
              {content}
            </article>
          )
        })}
      </div>
      {ads.length > 1 ? (
        <span className="px-homeAdDots" aria-label={ariaLabel}>
          {ads.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-label={`Ver publicidad ${index + 1}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => scrollToAd(index)}
            />
          ))}
        </span>
      ) : null}
    </section>
  )
}

export default function PublicHomeExperience({
  slides,
  newsArchive,
  tournaments,
  ads,
  sponsors,
  metrics,
  clubs = [],
  hideHero = false,
  afterTournaments,
}: {
  slides: NewsItem[]
  newsArchive: NewsItem[]
  tournaments: TournamentItem[]
  ads: AdItem[]
  sponsors: SponsorItem[]
  metrics?: PublicMetrics
  clubs?: ClubItem[]
  hideHero?: boolean
  afterTournaments?: ReactNode
}) {
  const router = useRouter()
  const session = useSession()
  const heroPrimaryAction = useMemo(() => {
    if (session.role === 'player') {
      return { label: 'Ir a mi espacio', href: '/player' }
    }

    if (session.role === 'club' || session.role === 'platform') {
      return { label: 'Ir al club', href: '/club' }
    }

    return { label: 'Registrate gratis!', href: '/register' }
  }, [session.role])
  const orderedNews = useMemo(() => {
    const merged = [...slides, ...newsArchive]
    return merged.filter((item, index) => merged.findIndex((entry) => entry.id === item.id) === index)
  }, [newsArchive, slides])
  const mainNews = orderedNews[0] ?? null
  const sideNews = orderedNews.slice(1, 3)
  const moreNews = orderedNews.slice(3, 6)
  const communityTournaments = useMemo(() => {
    return tournaments
      .map((tournament) => ({ tournament, displayStatus: getTournamentDisplayStatus(tournament) }))
      .filter(({ displayStatus }) => !['finished', 'draft', 'cancelled'].includes(displayStatus.key))
      .sort((current, next) => {
        if (current.displayStatus.priority !== next.displayStatus.priority) {
          return current.displayStatus.priority - next.displayStatus.priority
        }
        return tournamentSortTime(current.tournament) - tournamentSortTime(next.tournament)
      })
  }, [tournaments])
  const activeTournaments = communityTournaments
    .filter(({ displayStatus }) => displayStatus.key === 'live')
    .map(({ tournament }) => tournament)
    .slice(0, 3)
  const upcomingTournaments = communityTournaments
    .filter(({ displayStatus }) => ['registration_open', 'upcoming'].includes(displayStatus.key))
    .map(({ tournament }) => tournament)
    .slice(0, 3)
  const featuredClubs = clubs.slice(0, 4)
  const [hoveredHomeClubId, setHoveredHomeClubId] = useState<string | null>(null)
  const [isSponsorCarouselPaused, setIsSponsorCarouselPaused] = useState(false)
  const sponsorCarouselRef = useRef<HTMLDivElement | null>(null)
  const brandPartners = useMemo(() => {
    const sponsorItems = sponsors
      .filter((item) => hasMeaningfulSponsorText(item.name))
      .map((item) => ({
        id: `sponsor-${item.id}`,
        title: item.name.trim(),
        description: hasMeaningfulSponsorText(item.description) ? item.description?.trim() ?? null : null,
        imageUrl: item.logo_url,
        url: validExternalUrl(item.website_url),
        badge: sponsorBadge(item.tier),
        source: 'sponsor' as const,
      }))

    const adItems = ads
      .filter((item) => hasMeaningfulSponsorText(item.title))
      .map((item) => ({
        id: `ad-${item.id}`,
        title: item.title.trim(),
        description: hasMeaningfulSponsorText(item.description) ? item.description?.trim() ?? null : null,
        imageUrl: item.image_url,
        url: validExternalUrl(item.link_url),
        badge: 'Aliado activo',
        source: 'ad' as const,
      }))

    return [...sponsorItems, ...adItems].slice(0, 8)
  }, [ads, sponsors])
  const adsByHomeSlot = useMemo(() => {
    const now = Date.now()
    const activeAds = ads.filter((item) => {
      if (!hasMeaningfulSponsorText(item.title)) return false
      if (item.status && String(item.status).toUpperCase() !== 'ACTIVE') return false
      const startsAt = item.starts_at ? new Date(item.starts_at).getTime() : null
      const endsAt = item.ends_at ? new Date(item.ends_at).getTime() : null
      if (startsAt && startsAt > now) return false
      if (endsAt && endsAt < now) return false
      return true
    })

    function normalize(item: AdItem): HomeAdBannerItem {
      return {
        id: `ad-${item.id}`,
        title: item.title.trim(),
        description: hasMeaningfulSponsorText(item.description) ? item.description?.trim() ?? null : null,
        imageUrl: item.image_url,
        url: validExternalUrl(item.link_url),
        render_config: item.render_config,
      }
    }

    return {
      afterRanking: activeAds
        .filter((item) => item.slot === 'HOME_AFTER_RANKING' || item.slot === 'HOME_GRID')
        .map(normalize),
      afterNewsHero: activeAds
        .filter((item) => item.slot === 'HOME_AFTER_NEWS_HERO' || item.slot === 'HOME_INLINE' || item.slot === 'HOME_HERO')
        .map(normalize),
    }
  }, [ads])

  useEffect(() => {
    if (!brandPartners.length || isSponsorCarouselPaused) return
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
  }, [brandPartners.length, isSponsorCarouselPaused])

  function openNews(item: NewsItem) {
    router.push(`/noticias/${item.slug}`)
  }

  return (
    <div className="px-publicHome">
      {!hideHero ? (
        <PampraxHero
          kicker={`${BRAND.name} público`}
          title={'Viví tu carrera\ndeportiva'}
          primaryAction={heroPrimaryAction}
          secondaryAction={{ label: 'Explorar torneos', href: '/torneos' }}
        />
      ) : null}

      {activeTournaments.length ? (
        <section className="px-homeTournaments">
          <div className="px-homeSectionHead is-row">
            <div>
              <span>Competencia activa</span>
              <h2>Torneos en juego</h2>
            </div>
            <Link href="/torneos" className="px-homePillButton">Ver más</Link>
          </div>
          <div className="px-homeTournamentCards clubPublicTournamentGrid">
            {activeTournaments.map((item) => (
              <TournamentPublicCard key={item.id} compactAgenda tournament={item} showClub />
            ))}
          </div>
        </section>
      ) : null}

      {upcomingTournaments.length ? (
        <section className="px-homeTournaments">
          <div className="px-homeSectionHead is-row">
            <div>
              <span>Calendario Selpa</span>
              <h2>Proximos Torneos</h2>
            </div>
            <Link href="/torneos" className="px-homePillButton">Ver más</Link>
          </div>
          <div className="px-homeTournamentCards clubPublicTournamentGrid">
            {upcomingTournaments.map((item) => (
              <TournamentPublicCard key={item.id} compactAgenda tournament={item} showClub />
            ))}
          </div>
        </section>
      ) : null}

      {afterTournaments}

      <section className="px-homeRankingsExplore">
        <div className="px-homeSectionHead is-row">
          <div>
            <span>Conoce a los mejores</span>
            <h2>Rankings por club</h2>
          </div>
          <Link href="/ranking" className="px-homePillButton">Ver todos</Link>
        </div>
        <div className="px-homeRankingClubGrid">
          {featuredClubs.length ? featuredClubs.map((club) => (
            <PublicRankingClubCard
              key={club.id}
              clubName={club.name}
              themeKey={club.clubThemeKey ?? club.theme_key}
              href={`/ranking?clubId=${club.id}`}
              variant="home"
              playersCount={club.players ?? 0}
              categories={club.categories}
              rankingType="Ranking anual"
            />
          )) : <div className="px-homeEmpty">Los rankings por club van a aparecer acá.</div>}
        </div>
      </section>

      <HomeAdBannerSlot ads={adsByHomeSlot.afterRanking} ariaLabel="Publicidad después de rankings" />

      <section className="px-homeClubsFeatured">
        <div className="px-homeSectionHead is-row">
          <div>
            <span>Explora los clubes</span>
            <h2>Comunidad SELPA</h2>
          </div>
          <Link href="/clubes" className="px-homePillButton">Ver todos</Link>
        </div>
        <div className="px-homeClubCards">
          {featuredClubs.length ? featuredClubs.map((club) => {
            const logo = buildAssetProxyUrl(club.logo_url)
            const location = club.city || `Club ${BRAND.name}`
            const nameSize = club.name.length > 30 ? '22px' : club.name.length > 18 ? '26px' : club.name.length > 15 ? '30px' : undefined
            const theme = getClubTheme(club.clubThemeKey ?? club.theme_key)
            const clubStyle = {
              ['--club-card-accent' as string]: theme.vars.accent,
              ['--club-card-accent-2' as string]: theme.vars.accent2,
              ['--club-card-soft' as string]: theme.vars.soft,
              ['--club-card-glow' as string]: theme.vars.glow,
            } satisfies CSSProperties
            return (
              <Link
                className="publicClubCard px-homeClubCard"
                href={`/clubs/${club.id}`}
                key={club.id}
                aria-label={`Ver club ${club.name}`}
                style={clubStyle}
                onBlur={() => setHoveredHomeClubId(null)}
                onFocus={() => setHoveredHomeClubId(club.id)}
                onMouseEnter={() => setHoveredHomeClubId(club.id)}
                onMouseLeave={() => setHoveredHomeClubId(null)}
              >
                <span className={`publicClubLogo ${logo ? 'has-image' : ''}`}>
                  {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : getClubInitials(club.name)}
                </span>
                <div className="publicClubBody">
                  <small style={{ fontSize: 9, gap: 6, lineHeight: 1, padding: '5px 8px', right: 14, top: 12 }}>Club activo</small>
                  <h2 style={nameSize ? { ['--club-name-size' as string]: nameSize } : undefined}>{club.name}</h2>
                  <span
                    className="px-homeClubNameAccent"
                    aria-hidden="true"
                    style={{
                      ['--club-accent-width' as string]: hoveredHomeClubId === club.id ? '230px' : '110px',
                      ['--club-accent-position' as string]: hoveredHomeClubId === club.id ? '100% 0' : '0 0',
                      ['--club-accent-opacity' as string]: hoveredHomeClubId === club.id ? '.98' : '.84',
                      ['--club-accent-shift' as string]: hoveredHomeClubId === club.id ? '4px' : '0',
                    }}
                  />
                  <p style={{ lineHeight: 1.12, margin: '-4px 0 9px' }}>{location}</p>
                  <div className="publicClubStats">
                    <span><b>{metricValue(club.players ?? 0, '0')}</b> jugadores</span>
                    <span><b>{metricValue(club.tournaments ?? 0, '0')}</b> torneos</span>
                  </div>
                </div>
                <span className="publicClubAction">
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            )
          }) : <div className="px-homeEmpty">Los clubes destacados van a aparecer acá.</div>}
        </div>
      </section>

      <section className="px-homeNewsPortal">
        <div className="px-homeSectionHead is-row">
          <div>
            <span>Información general</span>
            <h2>Ultimas noticias</h2>
          </div>
          <Link href="/noticias" className="px-homeNewsButton">Ver más</Link>
        </div>
        <div className="px-homeNewsPortalGrid">
          <div className="px-homeNewsLead">
            {mainNews ? (
              <button type="button" className="px-homeMainNews" style={newsThemeStyle(mainNews)} onClick={() => openNews(mainNews)}>
                {mainNews.cover_url ? <img src={mainNews.cover_url} alt={mainNews.title} /> : <div className="px-homeNewsFallback" />}
                <span className="px-homeNewsBadge">{newsSourceLabel(mainNews)}</span>
                <span className="px-homeNewsDateChip">{formatDate(mainNews.published_at || mainNews.updated_at)}</span>
                <div>
                  <span className="px-homeNewsKicker">{placementLabel(mainNews.placement)}</span>
                  <strong>{mainNews.title}</strong>
                  <p>{mainNews.excerpt || `Cobertura deportiva pública de ${BRAND.name}.`}</p>
                </div>
              </button>
            ) : <div className="px-homeEmpty">Todavía no hay noticias públicas.</div>}
            <HomeAdBannerSlot ads={adsByHomeSlot.afterNewsHero} ariaLabel="Publicidad después de la noticia destacada" />
          </div>
          <div className="px-homeSideNews">
            {sideNews.length ? sideNews.map((item) => (
              <button key={item.id} type="button" style={newsThemeStyle(item)} onClick={() => openNews(item)}>
                {item.cover_url ? <img src={item.cover_url} alt="" /> : <div className="px-homeNewsFallback" />}
                <span className="px-homeNewsBadge">{newsSourceLabel(item)}</span>
                <span className="px-homeNewsDateChip">{formatDate(item.published_at || item.updated_at)}</span>
                <strong>{item.title}</strong>
              </button>
            )) : <div className="px-homeEmpty">Las noticias recientes van a aparecer acá.</div>}
          </div>
        </div>
        {moreNews.length ? (
          <div className="px-homeMoreNews">
            {moreNews.map((item) => (
              <button key={item.id} type="button" style={newsThemeStyle(item)} onClick={() => openNews(item)}>
                {item.cover_url ? <img src={item.cover_url} alt="" /> : <div className="px-homeNewsFallback" />}
                <span className="px-homeNewsBadge">{newsSourceLabel(item)}</span>
                <span className="px-homeNewsDateChip">{formatDate(item.published_at || item.updated_at)}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {brandPartners.length ? (
        <section className="px-homeSponsors" aria-label="Sponsors y aliados">
          <div className="px-homeSponsorsIntro">
            <span>Marcas que acompañan SELPA</span>
            <h2>Potenciamos el pádel. Juntos.</h2>
            <p>Sponsors y aliados que impulsan la comunidad deportiva.</p>
            <button type="button">Conocé nuestros aliados</button>
          </div>
          <div
            className="px-homeSponsorCarousel"
            ref={sponsorCarouselRef}
            onMouseEnter={() => setIsSponsorCarouselPaused(true)}
            onMouseLeave={() => setIsSponsorCarouselPaused(false)}
            onFocus={() => setIsSponsorCarouselPaused(true)}
            onBlur={() => setIsSponsorCarouselPaused(false)}
            onPointerDown={() => setIsSponsorCarouselPaused(true)}
            onPointerUp={() => setIsSponsorCarouselPaused(false)}
          >
            {brandPartners.map((item, index) => {
              const badge = item.source === 'ad' ? 'Aliado' : index === 0 ? 'Sponsor principal' : 'Sponsor oficial'
              const content = (
                <>
                  <span className="px-homeSponsorBadge">{badge}</span>
                  <span className={`px-homeSponsorLogo ${item.imageUrl ? 'has-image' : ''}`}>
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : sponsorInitials(item.title)}
                  </span>
                  <span className="px-homeSponsorBody">
                    <strong>{item.title}</strong>
                    {item.description ? <p>{item.description}</p> : null}
                    {item.url ? <em>{item.source === 'sponsor' ? 'Conocer más' : 'Ver sponsor'} <b aria-hidden="true">→</b></em> : null}
                  </span>
                </>
              )

              if (item.url) {
                return (
                  <a className="px-homeSponsorCard" href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    {content}
                  </a>
                )
              }

              return (
                <article className="px-homeSponsorCard" key={item.id}>
                  {content}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .px-publicHome { color: #061b3a; display: grid; gap: 20px; overflow-x: hidden; }
        .px-homeHeroCompact { align-items: center; background: radial-gradient(circle at 18% 6%, rgba(34,211,238,.3), transparent 34%), radial-gradient(circle at 84% 18%, rgba(236,72,153,.1), transparent 28%), linear-gradient(135deg, #020617 0%, #061b3a 58%, #071426 100%); border: 1px solid rgba(103,232,249,.14); border-radius: 22px; box-shadow: 0 22px 52px rgba(2,6,23,.16); color: #fff; display: grid; gap: 18px; grid-template-columns: minmax(0,1fr) 210px; min-height: 128px; overflow: hidden; padding: clamp(12px, 1.7vw, 18px); position: relative; }
        .px-homeHeroCompact::before { background-image: linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 42px 42px; content: ""; inset: 0; mask-image: linear-gradient(90deg, black, transparent 82%); opacity: .45; position: absolute; }
        .px-homeHeroCompact::after { background: linear-gradient(90deg, #22d3ee 0%, #67e8f9 40%, #8bd3ed 50%, #ec4899 100%); bottom: 0; content: ""; height: 4px; left: 0; position: absolute; right: 0; }
        .px-homeHeroText { display: grid; gap: 11px; max-width: 720px; position: relative; z-index: 1; }
        .px-homeHeroCompact span, .px-homeSectionHead > span, .px-homeSectionHead > div > span { background: linear-gradient(90deg, #0891b2 0%, #0e7490 55%, #be185d 120%); -webkit-background-clip: text; background-clip: text; color: #0e7490; font-size: 12px; font-weight: 950; letter-spacing: .09em; text-transform: uppercase; -webkit-text-fill-color: transparent; }
        .px-homeHeroCompact h1 { font-size: clamp(36px, 4.8vw, 54px); font-weight: 850; letter-spacing: -.035em; line-height: .94; margin: 0; }
        .px-homeHeroCompact p { color: rgba(255,255,255,.78); font-size: clamp(16px, 1.8vw, 21px); font-weight: 720; line-height: 1.35; margin: 0; max-width: 600px; }
        .px-homeCtaBanners, .px-homeSectionHead.is-row { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; }
        .px-homeHeroActions { align-content: center; display: grid; gap: 10px; position: relative; z-index: 1; }
        .px-homeHeroActions a, .px-homePillButton, .px-homeJoinButton { align-items: center; border-radius: 999px; display: inline-flex; font-size: 13px; font-weight: 950; justify-content: center; min-height: 44px; padding: 12px 16px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease; }
        .px-homeHeroActions a:first-child, .px-homeJoinButton { background: linear-gradient(135deg, #020617, #061b3a); border: 1px solid rgba(103,232,249,.5); box-shadow: 0 18px 34px rgba(6,182,212,.22); color: #e0faff; }
        .px-homeHeroActions a:last-child { background: rgba(255,255,255,.92); border: 1px solid rgba(34,211,238,.38); box-shadow: inset 0 0 0 1px rgba(236,72,153,.12); color: #061b3a; backdrop-filter: blur(12px); }
        .px-homePillButton { background: #fff; border: 1px solid rgba(34,211,238,.34); box-shadow: inset 0 0 0 1px rgba(236,72,153,.08); color: #061b3a; padding: 11px 14px; }
        .px-homeHeroActions a:hover, .px-homePillButton:hover, .px-homeJoinButton:hover { box-shadow: 0 24px 50px rgba(6,182,212,.22); transform: translateY(-2px); }
        .px-homeCtaBanners { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
        .px-homeCtaBanners a { align-items: center; background: #fff; border: 2px solid transparent; border-radius: 22px; box-shadow: 0 16px 42px rgba(15,23,42,.06); color: #061b3a; display: grid; gap: 6px 14px; grid-template-columns: 64px minmax(0,1fr); grid-template-rows: auto auto; min-height: 112px; overflow: hidden; padding: 12px 16px; position: relative; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .px-homeCtaBanners a::before { background: linear-gradient(#fff,#fff) padding-box, var(--cta-line) border-box; border: 2px solid transparent; border-radius: 22px; content: ""; inset: 0; pointer-events: none; position: absolute; }
        .px-homeCtaBanners a > * { position: relative; z-index: 1; }
        .px-homeCtaBanners a.is-cyan { --cta-line: linear-gradient(135deg, #22d3ee 0%, #67e8f9 68%, #ec4899 100%); --cta-glow: rgba(34,211,238,.18); }
        .px-homeCtaBanners a.is-balanced { --cta-line: linear-gradient(135deg, #22d3ee 0%, #67e8f9 35%, #c084fc 52%, #ec4899 100%); --cta-glow: rgba(168,85,247,.16); }
        .px-homeCtaBanners a.is-magenta { --cta-line: linear-gradient(135deg, rgba(34,211,238,.72) 0%, #ec4899 46%, #f472b6 100%); --cta-glow: rgba(236,72,153,.2); }
        .px-homeCtaBanners a:hover, .px-homeActivityGrid a:hover, .px-homeTournamentCards article:not(.TournamentPublicCard):hover, .px-homeMainNews:hover, .px-homeSideNews button:hover, .px-homeReasonGrid article:hover { box-shadow: 0 24px 58px rgba(15,23,42,.1); transform: translateY(-2px); }
        .px-homeCtaBanners i { align-items: center; align-self: center; background: #061b3a; border-radius: 20px; color: #67e8f9; display: inline-flex; grid-row: 1 / 3; height: 60px; justify-content: center; transition: transform .18s ease, box-shadow .18s ease; width: 60px; }
        .px-homeCtaBanners a:hover i { box-shadow: 0 16px 28px rgba(6,182,212,.18); transform: translateY(-2px) rotate(-3deg) scale(1.04); }
        .px-homeCtaBanners div { align-self: end; display: grid; gap: 4px; min-width: 0; }
        .px-homeCtaBanners strong { font-size: 17px; font-weight: 950; }
        .px-homeCtaBanners span { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; }
        .px-homeCtaBanners em { align-self: start; background: linear-gradient(135deg, #020617, #061b3a); border: 1px solid rgba(103,232,249,.42); border-radius: 999px; box-shadow: 0 12px 22px rgba(6,182,212,.12); color: #e0faff; font-size: 11px; font-style: normal; font-weight: 950; justify-self: end; margin-right: 10px; padding: 6px 10px; text-align: center; white-space: nowrap; }
        .px-homeSectionHead { display: grid; gap: 4px; }
        .px-homeSectionHead.is-row { justify-content: space-between; }
        .px-homeSectionHead > div { padding-left: 15px; position: relative; }
        .px-homeSectionHead > div::before { background: linear-gradient(180deg, #22d3ee 0%, #0891b2 52%, #ec4899 100%); border-radius: 999px; bottom: 1px; box-shadow: 0 10px 22px rgba(6,182,212,.18); content: ""; left: 0; position: absolute; top: 1px; width: 4px; }
        .px-homeSectionHead h2 { font-size: clamp(26px, 4vw, 42px); font-weight: 950; letter-spacing: -.055em; line-height: .95; margin: 0; }
        .px-homeSectionHead p { color: #64748b; font-size: 14px; font-weight: 750; margin: 3px 0 0; max-width: 620px; }
        .px-homeNewsPortal, .px-homeTournaments, .px-homeRankingsExplore, .px-homeClubsFeatured, .px-homeJoin { display: grid; gap: 14px; }
        .px-homeNewsPortalGrid { display: grid; gap: 14px; grid-template-columns: minmax(0,1.25fr) minmax(300px,.75fr); }
        .px-homeNewsLead { display: grid; gap: 10px; min-width: 0; }
        .px-homeMainNews, .px-homeSideNews button { border: 0; cursor: pointer; font: inherit; text-align: left; transition: transform .18s ease, box-shadow .18s ease; }
        .px-homeMainNews { background: #061b3a; border-radius: 24px; color: #fff; min-height: 360px; overflow: hidden; padding: 0; position: relative; }
        .px-homeMainNews img, .px-homeMainNews > .px-homeNewsFallback { display: block; height: 100%; inset: 0; object-fit: cover; opacity: .74; position: absolute; width: 100%; }
        .px-homeNewsFallback { background: radial-gradient(circle at 20% 0, rgba(34,211,238,.28), transparent 34%), linear-gradient(135deg, #061b3a, #0f274a); }
        .px-homeMainNews div { background: linear-gradient(180deg, transparent, rgba(2,6,23,.88)); bottom: 0; display: grid; gap: 8px; left: 0; padding: 18px; position: absolute; right: 0; }
        .px-homeMainNews span, .px-homeAdStripThin span { color: #67e8f9; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .px-homeMainNews strong { font-size: clamp(24px, 3.8vw, 40px); font-weight: 950; letter-spacing: -.045em; line-height: 1; }
        .px-homeMainNews p { color: rgba(255,255,255,.78); font-size: 14px; font-weight: 720; margin: 0; max-width: 720px; }
        .px-homeSideNews { display: grid; gap: 10px; }
        .px-homeSideNews button { background: #061b3a; border: 1px solid rgba(103,232,249,.16); border-radius: 20px; color: #fff; display: grid; gap: 7px; min-height: 112px; overflow: hidden; padding: 14px; position: relative; }
        .px-homeSideNews button::after { background: linear-gradient(180deg, rgba(2,6,23,.2), rgba(2,6,23,.88)); content: ""; inset: 0; position: absolute; }
        .px-homeSideNews button img, .px-homeSideNews button > .px-homeNewsFallback { display: block; height: 100%; inset: 0; object-fit: cover; opacity: .7; position: absolute; width: 100%; }
        .px-homeSideNews span, .px-homeSideNews strong { position: relative; z-index: 1; }
        .px-homeSideNews span { align-self: end; color: #67e8f9; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .px-homeSideNews strong { font-size: 15px; font-weight: 950; line-height: 1.15; }
        .px-homeMoreNews { display: grid; gap: 14px; grid-template-columns: repeat(3,minmax(0,1fr)); }
        .px-homeMoreNews button { background: #061b3a; border: 1px solid rgba(103,232,249,.16); border-radius: 20px; color: #fff; cursor: pointer; display: grid; font: inherit; gap: 7px; min-height: 112px; overflow: hidden; padding: 14px; position: relative; text-align: left; transition: transform .18s ease, box-shadow .18s ease; }
        .px-homeMoreNews button:hover { box-shadow: 0 24px 58px rgba(15,23,42,.12), 0 0 0 4px rgba(34,211,238,.08); transform: translateY(-2px); }
        .px-homeMoreNews button::after { background: linear-gradient(180deg, rgba(2,6,23,.18), rgba(2,6,23,.88)); content: ""; inset: 0; position: absolute; }
        .px-homeMoreNews img, .px-homeMoreNews .px-homeNewsFallback { display: block; height: 100%; inset: 0; object-fit: cover; opacity: .7; position: absolute; width: 100%; }
        .px-homeMoreNews span, .px-homeMoreNews strong { position: relative; z-index: 1; }
        .px-homeMoreNews span { align-self: end; color: #67e8f9; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .px-homeMoreNews strong { font-size: 15px; font-weight: 950; line-height: 1.15; }
        .px-homeNewsButton, .px-homePillButton { background: #fff; border: 1px solid rgba(34,211,238,.34); border-radius: 999px; box-shadow: inset 0 0 0 1px rgba(236,72,153,.08); color: #061b3a; font-size: 13px; font-weight: 950; padding: 11px 14px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .px-homeNewsButton:hover, .px-homePillButton:hover { border-color: rgba(236,72,153,.28); box-shadow: 0 18px 34px rgba(6,182,212,.14); transform: translateY(-2px); }
        .px-homeActivityGrid { display: grid; gap: 12px; grid-template-columns: repeat(4,minmax(0,1fr)); }
        .px-homeActivityGrid a, .px-homeTournamentCards article:not(.TournamentPublicCard), .px-homeReasonGrid article { background: radial-gradient(circle at 0 0, rgba(34,211,238,.12), transparent 38%), #fff; border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 16px 44px rgba(15,23,42,.06); color: #061b3a; display: grid; gap: 7px; padding: 16px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .px-homeActivityGrid strong { color: #061b3a; font-size: 34px; font-weight: 950; letter-spacing: -.06em; line-height: .9; }
        .px-homeActivityGrid span { color: #0284c7; font-size: 12px; font-weight: 950; text-transform: uppercase; }
        .px-homeActivityGrid p { color: #64748b; font-size: 13px; font-weight: 760; margin: 0; }
        .px-homeTournamentCards { display: grid; gap: 14px; grid-template-columns: repeat(3,minmax(0,1fr)); overflow: visible; }
        .px-homeTournamentCards :global(.TournamentPublicCard) { height: 326px; min-height: 326px; }
        .px-homeTournamentCards article:not(.TournamentPublicCard) { grid-template-columns: 78px minmax(0,1fr); min-height: 220px; }
        .px-homeDateBlock { align-content: center; background: linear-gradient(180deg,#fff,#f8fbff); border: 1px solid rgba(34,211,238,.25); border-radius: 18px; display: grid; justify-items: center; min-height: 84px; padding: 8px; }
        .px-homeDateBlock strong { font-size: 32px; font-weight: 950; letter-spacing: -.07em; line-height: .9; }
        .px-homeDateBlock span { color: #0284c7; font-size: 13px; font-weight: 950; text-transform: uppercase; }
        .px-homeDateBlock small { color: #64748b; font-size: 11px; font-weight: 900; }
        .px-homeTournamentInfo { display: grid; gap: 7px; min-width: 0; }
        .px-homeClubLine { align-items: center; display: flex; gap: 8px; min-width: 0; }
        .px-homeClubLogo { align-items: center; background: #061b3a; border-radius: 12px; color: #fff; display: inline-flex; flex: 0 0 38px; font-size: 10px; font-weight: 950; height: 38px; justify-content: center; overflow: hidden; width: 38px; }
        .px-homeClubLogo.has-image { background-color: #fff; background-image: var(--club-logo); background-position: center; background-repeat: no-repeat; background-size: cover; border: 1px solid rgba(34,211,238,.24); }
        .px-homeClubLogo.is-large { border-radius: 18px; flex-basis: 62px; height: 62px; width: 62px; }
        .px-homeClubLine b { color: #475569; font-size: 11px; font-weight: 950; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
        .px-homeTournamentInfo > strong { font-size: 20px; font-weight: 950; letter-spacing: -.03em; line-height: 1.04; overflow-wrap: anywhere; }
        .px-homeTournamentInfo p { color: #64748b; font-size: 13px; font-weight: 850; margin: 0; }
        .px-homeTournamentInfo em { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.22); border-radius: 999px; color: #075985; font-size: 11px; font-style: normal; font-weight: 950; justify-self: start; padding: 6px 8px; }
        .px-homeTournamentInfo a { background: #061b3a; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 950; justify-self: start; margin-top: auto; padding: 8px 11px; text-decoration: none; }
        .px-homeRankingsExplore > .px-homeRankingClubGrid { display: grid; gap: 14px; grid-template-columns: repeat(3,minmax(0,1fr)) !important; }
        .px-homeClubCards { display: grid; gap: 14px; grid-template-columns: repeat(2,minmax(0,1fr)); }
        .px-homeClubCard::before, .px-homeClubCards :global(.publicClubCard)::before { content: none !important; display: none !important; }
        .px-homeClubCard .publicClubBody small { font-size: 8px; gap: 3px; line-height: 1; padding: 3px 6px; top: 12px; }
        .px-homeClubCard .publicClubBody small::before { height: 4px; width: 4px; }
        .px-homeClubCard .publicClubBody h2 { margin-bottom: 4px; }
        .px-homeClubCard .publicClubBody p { line-height: 1.15; margin-top: -9px; }
        .px-homeClubNameAccent { background: linear-gradient(90deg, var(--club-card-accent, #22d3ee) 0%, color-mix(in srgb, var(--club-card-accent, #22d3ee) 64%, var(--club-card-accent-2, #ec4899)) 48%, var(--club-card-accent-2, #ec4899) 100%); background-position: var(--club-accent-position, 0 0); background-size: 220% 100%; border: 0 !important; border-radius: 999px; display: block; font-size: 0; height: 5px !important; line-height: 0; margin: 0; max-width: 88%; opacity: var(--club-accent-opacity, .84); padding: 0 !important; transform: translateX(var(--club-accent-shift, 0)); transition: width .34s ease, opacity .24s ease, transform .24s ease, background-position .42s ease; width: var(--club-accent-width, 110px); }
        .px-homeClubNameAccent::after { content: none !important; display: none !important; }
        :global(.px-homeAdBanners) { display: grid; gap: 6px; min-width: 0; width: 100%; }
        :global(.px-homeAdTrack) { display: grid; grid-auto-columns: 100%; grid-auto-flow: column; min-width: 0; overflow-x: auto; scroll-behavior: smooth; scroll-snap-type: x mandatory; scrollbar-width: none; }
        :global(.px-homeAdTrack::-webkit-scrollbar) { display: none; }
        :global(.px-homeAdBanner) { background: #061b3a; border: 0; border-radius: 8px; box-shadow: 0 12px 28px rgba(15,23,42,.12); color: #fff; display: block; height: ${AD_BANNER_DIMENSIONS.desktopHeight}px; min-width: 0; overflow: hidden; position: relative; scroll-snap-align: start; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; width: 100%; }
        :global(.px-homeAdBanner:hover) { box-shadow: 0 16px 34px rgba(15,23,42,.16); transform: translateY(-1px); }
        :global(.px-homeAdBanner img) { display: block; height: 100%; inset: 0; object-fit: cover; position: absolute; width: 100%; }
        :global(.px-homeAdBannerOverlay) { background: linear-gradient(90deg,rgba(2,6,23,.78) 0%,rgba(2,6,23,.34) 58%,rgba(2,6,23,.08) 100%), linear-gradient(180deg,rgba(2,6,23,.08) 0%,rgba(2,6,23,.34) 100%); inset: 0; position: absolute; }
        :global(.px-homeAdBadge) { align-items: center; background: rgba(255,255,255,.86); border-radius: 999px; color: #061b3a; display: inline-flex; font-size: 8px; font-weight: 950; letter-spacing: .08em; line-height: 1; padding: 4px 6px; position: absolute; right: 8px; text-transform: uppercase; top: 8px; z-index: 2; }
        :global(.px-homeAdBannerBody) { align-content: end; bottom: 0; display: grid; gap: 4px; left: 0; max-width: 72%; padding: 10px 12px; position: absolute; top: 0; z-index: 1; }
        :global(.px-homeAdBannerBody strong) { color: #fff; display: -webkit-box; font-size: clamp(14px,1.6vw,18px); font-weight: 900; letter-spacing: -.02em; line-height: 1.03; overflow: hidden; text-shadow: 0 2px 16px rgba(2,6,23,.42); -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        :global(.px-homeAdBannerBody em) { color: #e0faff; font-size: 9px; font-style: normal; font-weight: 950; letter-spacing: .04em; line-height: 1; text-transform: uppercase; }
        :global(.px-homeAdDots) { align-items: center; display: inline-flex; gap: 5px; justify-content: center; min-height: 10px; }
        :global(.px-homeAdDots button) { background: rgba(15,23,42,.22); border: 0; border-radius: 999px; height: 5px; padding: 0; transition: background .18s ease, transform .18s ease, width .18s ease; width: 5px; }
        :global(.px-homeAdDots button[aria-current="true"]) { background: linear-gradient(90deg,#22d3ee,#ec4899); width: 15px; }
        .px-homeJoin { background: linear-gradient(135deg, #fff, #f8fbff); border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 16px 44px rgba(15,23,42,.06); display: grid; gap: 14px; padding: 18px; }
        .px-homeReasonGrid { display: grid; gap: 12px; grid-template-columns: repeat(4,minmax(0,1fr)); }
        .px-homeReasonGrid strong { font-size: 16px; font-weight: 950; }
        .px-homeReasonGrid p { color: #64748b; font-size: 13px; font-weight: 760; line-height: 1.4; margin: 0; }
        .px-homeJoinButton { justify-self: start; }
        .px-homeSponsors { background: radial-gradient(circle at 0 0, rgba(34,211,238,.22), transparent 34%), radial-gradient(circle at 100% 20%, rgba(236,72,153,.16), transparent 30%), linear-gradient(135deg, #020617 0%, #061b3a 55%, #071426 100%); border: 1px solid rgba(34,211,238,.2); border-radius: 26px; box-shadow: 0 26px 64px rgba(2,6,23,.18); color: #fff; display: grid; gap: 20px; grid-template-columns: minmax(230px,.3fr) minmax(0,.7fr); overflow: hidden; padding: clamp(18px, 2.4vw, 26px); position: relative; }
        .px-homeSponsors::after { background: linear-gradient(90deg, #22d3ee 0%, rgba(34,211,238,.55) 32%, rgba(236,72,153,.72) 100%); bottom: 0; content: ""; height: 4px; left: 0; position: absolute; right: 0; }
        .px-homeSponsorsIntro { align-content: center; display: grid; gap: 10px; min-width: 0; position: relative; z-index: 1; }
        .px-homeSponsorsIntro span { color: #67e8f9; font-size: 11px; font-weight: 950; letter-spacing: .11em; text-transform: uppercase; }
        .px-homeSponsorsIntro h2 { font-size: clamp(28px, 3vw, 42px); font-weight: 950; letter-spacing: -.06em; line-height: .92; margin: 0; max-width: 340px; }
        .px-homeSponsorsIntro p { color: rgba(226,250,255,.74); font-size: 14px; font-weight: 760; line-height: 1.35; margin: 0; max-width: 330px; }
        .px-homeSponsorsIntro button { background: rgba(255,255,255,.08); border: 1px solid rgba(103,232,249,.42); border-radius: 999px; color: #e0faff; cursor: default; font: inherit; font-size: 12px; font-weight: 950; justify-self: start; margin-top: 6px; padding: 10px 13px; }
        .px-homeSponsorCarousel { display: grid; gap: 14px; grid-auto-columns: minmax(230px, 260px); grid-auto-flow: column; min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; padding: 4px 4px 16px; position: relative; scroll-behavior: smooth; scroll-snap-type: x proximity; scrollbar-color: rgba(103,232,249,.45) rgba(255,255,255,.08); z-index: 1; }
        .px-homeSponsorCarousel::-webkit-scrollbar { height: 8px; }
        .px-homeSponsorCarousel::-webkit-scrollbar-track { background: rgba(255,255,255,.08); border-radius: 999px; }
        .px-homeSponsorCarousel::-webkit-scrollbar-thumb { background: linear-gradient(90deg, #22d3ee, #ec4899); border-radius: 999px; }
        .px-homeSponsorCard { align-content: start; background: rgba(8,30,58,.82); border: 1px solid rgba(103,232,249,.16); border-radius: 18px; box-shadow: 0 18px 40px rgba(2,6,23,.18); color: #fff; display: grid; gap: 11px; min-height: 238px; overflow: hidden; padding: 14px; position: relative; scroll-snap-align: start; text-decoration: none; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
        .px-homeSponsorCard:hover { border-color: rgba(103,232,249,.42); box-shadow: 0 22px 50px rgba(2,6,23,.24), 0 0 0 1px rgba(236,72,153,.1) inset; transform: translateY(-2px); }
        .px-homeSponsorBadge { align-items: center; background: rgba(34,211,238,.09); border: 1px solid rgba(103,232,249,.18); border-radius: 999px; color: #9ff6ff; display: inline-flex; font-size: 9px; font-weight: 950; justify-self: start; letter-spacing: .04em; padding: 5px 8px; text-transform: uppercase; }
        .px-homeSponsorLogo { align-items: center; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.08); border-radius: 15px; color: #e0faff; display: flex; font-size: 30px; font-weight: 950; height: 92px; justify-content: center; overflow: hidden; padding: 14px; text-align: center; }
        .px-homeSponsorLogo.has-image { background: rgba(255,255,255,.94); }
        .px-homeSponsorLogo img { display: block; max-height: 76px; max-width: 100%; object-fit: contain; }
        .px-homeSponsorBody { display: grid; gap: 7px; min-width: 0; }
        .px-homeSponsorBody strong { color: #fff; font-size: 18px; font-weight: 950; letter-spacing: -.035em; line-height: 1; overflow-wrap: anywhere; }
        .px-homeSponsorBody p { color: rgba(226,250,255,.68); display: -webkit-box; font-size: 12px; font-weight: 720; line-height: 1.35; margin: 0; overflow: hidden; WebkitBoxOrient: vertical; WebkitLineClamp: 2; }
        .px-homeSponsorBody em { align-items: center; color: #67e8f9; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 950; gap: 7px; justify-self: start; margin-top: 2px; text-transform: uppercase; transition: color .18s ease; }
        .px-homeSponsorBody b { font-size: 15px; line-height: 1; transition: transform .18s ease; }
        .px-homeSponsorCard:hover .px-homeSponsorBody em { color: #fff; }
        .px-homeSponsorCard:hover .px-homeSponsorBody b { transform: translateX(3px); }
        .px-homeEmpty { background: rgba(255,255,255,.88); border: 1px dashed rgba(15,23,42,.14); border-radius: 18px; color: #64748b; font-size: 13px; font-weight: 760; padding: 18px; }
        @media (max-width: 1080px) {
          .px-homeNewsPortalGrid, .px-homeClubCards { grid-template-columns: 1fr; }
          .px-homeActivityGrid, .px-homeTournamentCards, .px-homeReasonGrid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .px-homeSponsors { grid-template-columns: minmax(220px,.36fr) minmax(0,.64fr); }
        }
        @media (max-width: 720px) {
          /* Prevent wide tournament/ranking internals from expanding the page grid past the mobile viewport. */
          .px-publicHome { contain: layout paint; }
          .px-homeTournaments, .px-homeRankingsExplore, .px-homeClubsFeatured, .px-homeNewsPortal { min-width: 0; width: 100%; }
          .px-homeSectionHead.is-row, .px-homeTournamentCards, .px-homeRankingClubGrid, .px-homeClubCards, .px-homeNewsPortalGrid { max-width: 100%; min-width: 0; width: 100%; }
          .px-homeTournamentCards :global(.TournamentPublicCard) { max-width: 100%; min-width: 0; width: 100%; }
          :global(.px-homeAdBanners) { contain: paint; overflow-x: clip; width: 100%; }
          .px-homeHeroCompact { border-radius: 22px; gap: 10px; grid-template-columns: minmax(0, 1fr) minmax(116px, 34%); min-height: 132px; padding: 12px 16px; }
          .px-homeHeroCompact h1 { font-size: clamp(28px, 8vw, 36px); font-weight: 850; letter-spacing: -.03em; line-height: .96; }
          .px-homeHeroCompact p { font-size: 15px; }
          .px-homeHeroActions { align-content: center; gap: 7px; grid-template-columns: 1fr; justify-self: end; width: 100%; }
          .px-homeHeroActions a { font-size: 10.5px; min-height: 34px; padding: 8px 8px; }
          .px-homeCtaBanners, .px-homeActivityGrid, .px-homeReasonGrid { grid-template-columns: 1fr; }
          .px-homeSponsors { grid-template-columns: 1fr; }
          .px-homeSponsorCarousel { grid-auto-columns: minmax(220px, 78vw); }
          .px-homeAdBanners { grid-template-columns: 1fr; }
          .px-homeTournamentCards { display: grid; gap: 12px; grid-template-columns: 1fr; margin: 0; overflow: visible; padding: 0; }
          .px-homeTournamentCards :global(.TournamentPublicCard) { height: 326px; min-height: 326px; }
          .px-homeCtaBanners a { grid-template-columns: 64px minmax(0,1fr); min-height: 108px; }
          .px-homeCtaBanners em { grid-column: 2; justify-self: start; margin-right: 0; }
          .px-homeSectionHead.is-row { align-items: flex-start; flex-direction: row; flex-wrap: nowrap; padding-right: 0; position: relative; }
          .px-homeSectionHead.is-row > div { max-width: calc(100% - 74px); min-width: 0; }
          .px-homeSectionHead h2 { font-size: clamp(23px, 7.2vw, 29px); letter-spacing: -.035em; white-space: normal; }
          .px-homeSectionHead.is-row .px-homePillButton, .px-homeSectionHead.is-row .px-homeNewsButton { display: inline-flex; flex-shrink: 0; font-size: 9px; letter-spacing: .02em; line-height: 1; min-height: 28px; padding: 6px 8px; position: absolute; right: 0; text-align: center; text-transform: uppercase; top: 0; white-space: nowrap; width: max-content; }
          .px-homeNewsPortalGrid, .px-homeMoreNews { grid-template-columns: 1fr; }
          .px-homeRankingsExplore > .px-homeRankingClubGrid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
          .px-homeMainNews { min-height: 260px; }
          :global(.px-homeAdBanner) { border-radius: 7px; height: ${AD_BANNER_DIMENSIONS.mobileHeight}px; }
          :global(.px-homeAdBannerBody) { max-width: 76%; padding: 8px 10px; }
          :global(.px-homeAdBannerBody strong) { font-size: 13px; }
          :global(.px-homeAdBadge) { font-size: 7px; padding: 3px 5px; right: 6px; top: 6px; }
          .px-homeTournamentCards article:not(.TournamentPublicCard) { grid-template-columns: 1fr; }
          .px-homeDateBlock { align-items: center; display: flex; gap: 9px; justify-content: flex-start; min-height: 0; }
        }
      `}</style>
    </div>
  )
}
