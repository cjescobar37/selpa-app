'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { Building2, LogIn, UserRound } from 'lucide-react'
import { buildAssetProxyUrl, getClubInitials } from '@/lib/clubAssets'
import { getPublicAdSlot, PUBLIC_AD_SLOTS, type PublicAdSlotConfig } from '@/lib/publicAdSlots'
import PampraxHero from '@/components/ui/PampraxHero'
import TournamentPublicCard from '@/components/public/TournamentPublicCard'

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
}

type SponsorItem = {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
  tier: string
}

type ClubItem = {
  id: string
  name: string
  city: string | null
  logo_url: string | null
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

type AssignedAdSlots = Record<string, AdItem | null>

function formatDate(value?: string | null) {
  if (!value) return 'Fecha a confirmar'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
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

function placementLabel(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'Última noticia'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Noticia'
}

function newsSourceLabel(item: NewsItem) {
  return String((item as any).club_name ?? (item as any).clubName ?? (item as any).source ?? 'PAMPrax').toUpperCase()
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

function tournamentStatusLabel(status: string) {
  const value = String(status || '').toUpperCase()
  if (value.includes('OPEN') || value.includes('PUBLISHED')) return 'Inscripción abierta'
  if (['ACTIVE', 'LIVE', 'IN_PROGRESS', 'GROUPS', 'PLAYOFF'].some((item) => value.includes(item))) return 'En juego'
  if (['FINISHED', 'COMPLETED', 'CLOSED'].some((item) => value.includes(item))) return 'Finalizado'
  return 'Próximo'
}

function genderLabel(value: string) {
  const normalized = String(value || '').toUpperCase()
  if (normalized === 'M' || normalized === 'MALE') return 'Masculino'
  if (normalized === 'F' || normalized === 'FEMALE') return 'Femenino'
  if (normalized.includes('MIX')) return 'Mixto'
  return value || 'Rama'
}

function metricValue(value?: number | null, fallback = '—') {
  if (typeof value !== 'number') return fallback
  return new Intl.NumberFormat('es-AR').format(value)
}

function categorySummary(categories?: number[]) {
  if (!categories?.length) return 'Categorías abiertas'
  return categories.slice(0, 4).map((item) => `${item}ta`).join(' · ')
}

function assignHomeAdSlots(ads: AdItem[]): AssignedAdSlots {
  const used = new Set<string>()
  const bySlot = new Map(ads.map((ad) => [String(ad.slot || '').toLowerCase(), ad]))
  const assigned: AssignedAdSlots = {}

  for (const slot of PUBLIC_AD_SLOTS) {
    const exact = bySlot.get(slot.id.toLowerCase()) ?? null
    assigned[slot.id] = exact
    if (exact) used.add(exact.id)
  }

  let fallbackIndex = 0
  for (const slot of PUBLIC_AD_SLOTS) {
    if (assigned[slot.id]) continue
    while (fallbackIndex < ads.length && used.has(ads[fallbackIndex].id)) fallbackIndex += 1
    const fallback = ads[fallbackIndex] ?? null
    assigned[slot.id] = fallback
    if (fallback) used.add(fallback.id)
  }

  return assigned
}

function PublicAdSlot({ slot, ad }: { slot: PublicAdSlotConfig; ad: AdItem | null }) {
  const content = (
    <>
      {ad?.image_url ? <img src={ad.image_url} alt={ad.title} /> : null}
      <div className="px-homeAdSlotBody">
        <span>{slot.label}</span>
        <strong>{ad?.title || 'Este espacio puede ser tuyo'}</strong>
        <p>{ad?.description || 'Publicitá con Pamprax y llegá a jugadores y clubes.'}</p>
        <em>{ad ? 'Sponsor activo' : `Slot publicitario ${slot.ratio}`}</em>
        {!ad ? <b className="px-homeAdSlotCta">Quiero publicitar</b> : null}
      </div>
      {!ad ? <small>{slot.recommendedSize}</small> : null}
    </>
  )

  if (ad?.link_url) {
    return (
      <a className={`px-homeAdSlot ${slot.className}`} href={ad.link_url} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  }

  return <div className={`px-homeAdSlot ${slot.className}`}>{content}</div>
}

export default function PublicHomeExperience({
  slides,
  newsArchive,
  tournaments,
  ads,
  sponsors,
  metrics,
  clubs = [],
}: {
  slides: NewsItem[]
  newsArchive: NewsItem[]
  tournaments: TournamentItem[]
  ads: AdItem[]
  sponsors: SponsorItem[]
  metrics?: PublicMetrics
  clubs?: ClubItem[]
}) {
  const router = useRouter()
  const orderedNews = useMemo(() => {
    const merged = [...slides, ...newsArchive]
    return merged.filter((item, index) => merged.findIndex((entry) => entry.id === item.id) === index)
  }, [newsArchive, slides])
  const mainNews = orderedNews[0] ?? null
  const sideNews = orderedNews.slice(1, 3)
  const moreNews = orderedNews.slice(3, 6)
  const featuredTournaments = tournaments.slice(0, 3)
  const assignedAdSlots = useMemo(() => assignHomeAdSlots(ads), [ads])
  const featuredClubs = clubs.slice(0, 4)

  const reasons = [
    { title: 'Ranking personal', text: 'Seguí tu posición, puntos y categoría dentro de cada club.' },
    { title: 'Inscripciones simples', text: 'Encontrá torneos abiertos y accedé al flujo de inscripción.' },
    { title: 'Historial deportivo', text: 'Tu perfil reúne partidos, torneos, pareja y resultados.' },
    { title: 'Pareja activa', text: 'Organizá tu dupla y llegá preparado al próximo evento.' },
  ]

  function openNews(item: NewsItem) {
    router.push(`/noticias/${item.slug}`)
  }

  return (
    <div className="px-publicHome">
      <PampraxHero
        kicker="Pamprax público"
        title="Viví tu carrera deportiva"
        subtitle="Rankings, torneos, estadísticas y comunidad para el pádel amateur."
        primaryAction={{ label: 'Crear cuenta gratis', href: '/register' }}
        secondaryAction={{ label: 'Explorar torneos', href: '/torneos' }}
      />

      <section className="px-homeCtaBanners">
        <Link href="/register" className="is-cyan">
          <i><UserRound size={18} /></i>
          <div><strong>¿Querés ser jugador?</strong><span>Creá tu perfil, seguí ranking y torneos.</span></div>
          <em>Crear cuenta gratis</em>
        </Link>
        <Link href="/unir-mi-club" className="is-balanced">
          <i><Building2 size={18} /></i>
          <div><strong>¿Tenés un complejo?</strong><span>Publicá torneos y activá tu comunidad.</span></div>
          <em>Armá tu club gratis</em>
        </Link>
        <Link href="/login" className="is-magenta">
          <i><LogIn size={18} /></i>
          <div><strong>¿Ya sos jugador?</strong><span>Entrá y mirá tus novedades deportivas.</span></div>
          <em>Ingresar</em>
        </Link>
      </section>

      <section className="px-homeNewsPortal">
        <div className="px-homeSectionHead is-row">
          <div>
            <h2>Lo último del circuito</h2>
          </div>
          <Link href="/noticias" className="px-homeNewsButton">Ver todas las noticias</Link>
        </div>
        <div className="px-homeNewsPortalGrid">
          {mainNews ? (
            <button type="button" className="px-homeMainNews" style={newsThemeStyle(mainNews)} onClick={() => openNews(mainNews)}>
              {mainNews.cover_url ? <img src={mainNews.cover_url} alt={mainNews.title} /> : <div className="px-homeNewsFallback" />}
              <span className="px-homeNewsBadge">{newsSourceLabel(mainNews)}</span>
              <span className="px-homeNewsDateChip">{formatDate(mainNews.published_at || mainNews.updated_at)}</span>
              <div>
                <span className="px-homeNewsKicker">{placementLabel(mainNews.placement)}</span>
                <strong>{mainNews.title}</strong>
                <p>{mainNews.excerpt || 'Cobertura deportiva pública de Pamprax.'}</p>
              </div>
            </button>
          ) : <div className="px-homeEmpty">Todavía no hay noticias públicas.</div>}
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

      <section className="px-homeAdSlots is-home-ads" aria-label="Espacios publicitarios">
        <PublicAdSlot slot={getPublicAdSlot('home_ad_left_6x3')} ad={assignedAdSlots.home_ad_left_6x3} />
        <PublicAdSlot slot={getPublicAdSlot('home_ad_right_6x3')} ad={assignedAdSlots.home_ad_right_6x3} />
      </section>

      <section className="px-homeTournaments">
        <div className="px-homeSectionHead is-row">
          <div>
            <span>Próximos torneos</span>
            <h2>Agenda competitiva</h2>
          </div>
          <Link href="/torneos" className="px-homePillButton">Ver todo el calendario</Link>
        </div>
        {featuredTournaments.length ? (
          <>
            <div className="px-homeTournamentCards">
              {featuredTournaments.map((item) => (
                <TournamentPublicCard key={item.id} tournament={item} showClub />
              ))}
            </div>
          </>
        ) : <div className="px-homeEmpty">Todavía no hay torneos públicos para mostrar.</div>}
      </section>

      <section className="px-homeRankingsExplore">
        <div className="px-homeSectionHead is-row">
          <div>
            <span>Rankings</span>
            <h2>Explorá los rankings de cada club</h2>
            <p>Conocé posiciones, categorías y jugadores destacados de cada comunidad.</p>
          </div>
          <Link href="/ranking" className="px-homePillButton">Ver ranking</Link>
        </div>
        <div className="px-homeRankingClubGrid">
          {featuredClubs.length ? featuredClubs.map((club) => {
            const logo = buildAssetProxyUrl(club.logo_url)
            return (
              <Link key={club.id} href="/ranking" className="px-homeRankingClubCard">
                <span className={`px-homeClubLogo is-large ${logo ? 'has-image' : ''}`} style={logo ? { ['--club-logo' as string]: `url("${logo}")` } : undefined}>{logo ? null : getClubInitials(club.name)}</span>
                <div>
                  <small>Ranking anual</small>
                  <strong>{club.name}</strong>
                  <p>{metricValue(club.players ?? 0, '0')} jugadores · {categorySummary(club.categories)}</p>
                  <em>Masculino</em><em>Femenino</em>
                </div>
                <b>Ver ranking</b>
              </Link>
            )
          }) : <div className="px-homeEmpty">Los rankings por club van a aparecer acá.</div>}
        </div>
      </section>

      <section className="px-homeClubsFeatured">
        <div className="px-homeSectionHead">
          <span>Clubes destacados</span>
          <h2>Comunidades para explorar</h2>
        </div>
        <div className="px-homeClubCards">
          {featuredClubs.length ? featuredClubs.map((club) => {
            const logo = buildAssetProxyUrl(club.logo_url)
            return (
              <Link key={club.id} href="/clubs">
                <span className={`px-homeClubLogo is-large ${logo ? 'has-image' : ''}`} style={logo ? { ['--club-logo' as string]: `url("${logo}")` } : undefined}>{logo ? null : getClubInitials(club.name)}</span>
                <strong>{club.name}</strong>
                <p>{club.city || 'Club Pamprax'}</p>
                <div><span>{metricValue(club.players ?? 0, '0')} jugadores</span><span>{metricValue(club.tournaments ?? 0, '0')} torneos</span></div>
                <em>Ver actividad</em>
              </Link>
            )
          }) : <div className="px-homeEmpty">Los clubes destacados van a aparecer acá.</div>}
        </div>
      </section>

      <section className="px-homeJoin">
        <div className="px-homeSectionHead">
          <span>Por qué unirte</span>
          <h2>Tu pádel, con identidad deportiva</h2>
        </div>
        <div className="px-homeReasonGrid">
          {reasons.map((item) => (
            <article key={item.title}><strong>{item.title}</strong><p>{item.text}</p></article>
          ))}
        </div>
        <Link href="/register" className="px-homeJoinButton">Crear cuenta gratis</Link>
      </section>

      <section className="px-homeSponsors">
        <div className="px-homeSponsorTrack">
          {[...sponsors, ...sponsors].slice(0, 8).map((item, index) => (
            <a key={`${item.id}-${index}`} href={item.website_url || '#'} target="_blank" rel="noreferrer">
              {item.logo_url ? <img src={item.logo_url} alt={item.name} /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}
              <strong>{item.name}</strong>
            </a>
          ))}
          {!sponsors.length ? <div className="px-homeSponsorEmpty">Los sponsors principales van a aparecer acá.</div> : null}
        </div>
      </section>

      <style jsx>{`
        .px-publicHome { color: #061b3a; display: grid; gap: 20px; overflow-x: hidden; }
        .px-homeHeroCompact { align-items: center; background: radial-gradient(circle at 18% 6%, rgba(34,211,238,.3), transparent 34%), radial-gradient(circle at 84% 18%, rgba(236,72,153,.1), transparent 28%), linear-gradient(135deg, #020617 0%, #061b3a 58%, #071426 100%); border: 1px solid rgba(103,232,249,.14); border-radius: 22px; box-shadow: 0 22px 52px rgba(2,6,23,.16); color: #fff; display: grid; gap: 18px; grid-template-columns: minmax(0,1fr) 210px; min-height: 220px; overflow: hidden; padding: clamp(20px, 2.6vw, 28px); position: relative; }
        .px-homeHeroCompact::before { background-image: linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px); background-size: 42px 42px; content: ""; inset: 0; mask-image: linear-gradient(90deg, black, transparent 82%); opacity: .45; position: absolute; }
        .px-homeHeroCompact::after { background: linear-gradient(90deg, #22d3ee 0%, #67e8f9 40%, #8bd3ed 50%, #ec4899 100%); bottom: 0; content: ""; height: 4px; left: 0; position: absolute; right: 0; }
        .px-homeHeroText { display: grid; gap: 11px; max-width: 720px; position: relative; z-index: 1; }
        .px-homeHeroCompact span, .px-homeSectionHead > span { color: #67e8f9; font-size: 12px; font-weight: 950; letter-spacing: .09em; text-transform: uppercase; }
        .px-homeHeroCompact h1 { font-size: clamp(36px, 4.8vw, 54px); font-weight: 950; letter-spacing: -.075em; line-height: .9; margin: 0; }
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
        .px-homeCtaBanners a:hover, .px-homeActivityGrid a:hover, .px-homeTournamentCards article:not(.TournamentPublicCard):hover, .px-homeRankingClubCard:hover, .px-homeClubCards a:hover, .px-homeMainNews:hover, .px-homeSideNews button:hover, .px-homeReasonGrid article:hover, .px-homeSponsorTrack a:hover { box-shadow: 0 24px 58px rgba(15,23,42,.1); transform: translateY(-2px); }
        .px-homeCtaBanners i { align-items: center; align-self: center; background: #061b3a; border-radius: 20px; color: #67e8f9; display: inline-flex; grid-row: 1 / 3; height: 60px; justify-content: center; transition: transform .18s ease, box-shadow .18s ease; width: 60px; }
        .px-homeCtaBanners a:hover i { box-shadow: 0 16px 28px rgba(6,182,212,.18); transform: translateY(-2px) rotate(-3deg) scale(1.04); }
        .px-homeCtaBanners div { align-self: end; display: grid; gap: 4px; min-width: 0; }
        .px-homeCtaBanners strong { font-size: 17px; font-weight: 950; }
        .px-homeCtaBanners span { color: #64748b; font-size: 12px; font-weight: 800; line-height: 1.35; }
        .px-homeCtaBanners em { align-self: start; background: linear-gradient(135deg, #020617, #061b3a); border: 1px solid rgba(103,232,249,.42); border-radius: 999px; box-shadow: 0 12px 22px rgba(6,182,212,.12); color: #e0faff; font-size: 11px; font-style: normal; font-weight: 950; justify-self: end; margin-right: 10px; padding: 6px 10px; text-align: center; white-space: nowrap; }
        .px-homeSectionHead { display: grid; gap: 4px; }
        .px-homeSectionHead.is-row { justify-content: space-between; }
        .px-homeSectionHead h2 { font-size: clamp(26px, 4vw, 42px); font-weight: 950; letter-spacing: -.055em; line-height: .95; margin: 0; }
        .px-homeSectionHead p { color: #64748b; font-size: 14px; font-weight: 750; margin: 3px 0 0; max-width: 620px; }
        .px-homeNewsPortal, .px-homeTournaments, .px-homeRankingsExplore, .px-homeClubsFeatured, .px-homeJoin { display: grid; gap: 14px; }
        .px-homeNewsPortalGrid { display: grid; gap: 14px; grid-template-columns: minmax(0,1.25fr) minmax(300px,.75fr); }
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
        .px-homeAdStripThin { background: linear-gradient(135deg, rgba(2,6,23,.98), rgba(6,27,58,.96)); border: 1px solid rgba(103,232,249,.16); border-radius: 22px; color: #fff; min-height: 82px; overflow: hidden; }
        .px-homeAdStripThin a, .px-homeAdStripThin > div { align-items: center; color: inherit; display: grid; gap: 14px; grid-template-columns: 150px minmax(0,1fr); min-height: 82px; padding: 12px 16px; text-decoration: none; }
        .px-homeAdStripThin img { border-radius: 14px; height: 58px; object-fit: cover; width: 150px; }
        .px-homeAdStripThin strong { font-size: 18px; font-weight: 950; }
        .px-homeAdStripThin p { color: rgba(255,255,255,.7); font-size: 13px; margin: 0; }
        .px-homeActivityGrid { display: grid; gap: 12px; grid-template-columns: repeat(4,minmax(0,1fr)); }
        .px-homeActivityGrid a, .px-homeTournamentCards article:not(.TournamentPublicCard), .px-homeRankingClubCard, .px-homeClubCards a, .px-homeReasonGrid article { background: radial-gradient(circle at 0 0, rgba(34,211,238,.12), transparent 38%), #fff; border: 1px solid #e2e8f0; border-radius: 22px; box-shadow: 0 16px 44px rgba(15,23,42,.06); color: #061b3a; display: grid; gap: 7px; padding: 16px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
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
        .px-homeRankingClubGrid, .px-homeClubCards { display: grid; gap: 14px; grid-template-columns: repeat(2,minmax(0,1fr)); }
        .px-homeRankingClubCard { align-items: center; grid-template-columns: 62px minmax(0,1fr) auto; }
        .px-homeRankingClubCard small { color: #0284c7; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .px-homeRankingClubCard strong, .px-homeClubCards strong { display: block; font-size: 20px; font-weight: 950; letter-spacing: -.035em; line-height: 1.02; }
        .px-homeRankingClubCard p, .px-homeClubCards p { color: #64748b; font-size: 13px; font-weight: 800; margin: 4px 0 7px; }
        .px-homeRankingClubCard em { background: rgba(34,211,238,.1); border: 1px solid rgba(34,211,238,.2); border-radius: 999px; color: #075985; display: inline-flex; font-size: 11px; font-style: normal; font-weight: 950; margin-right: 5px; padding: 5px 8px; }
        .px-homeRankingClubCard b, .px-homeClubCards em { color: #0284c7; font-size: 12px; font-style: normal; font-weight: 950; white-space: nowrap; }
        .px-homeClubCards a { min-height: 190px; }
        .px-homeClubCards div { display: flex; flex-wrap: wrap; gap: 7px; }
        .px-homeClubCards div span { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; color: #475569; font-size: 11px; font-weight: 900; padding: 6px 8px; }
        .px-homeJoin { background: linear-gradient(135deg, #fff, #f8fbff); border: 1px solid #e2e8f0; border-radius: 24px; box-shadow: 0 16px 44px rgba(15,23,42,.06); display: grid; gap: 14px; padding: 18px; }
        .px-homeReasonGrid { display: grid; gap: 12px; grid-template-columns: repeat(4,minmax(0,1fr)); }
        .px-homeReasonGrid strong { font-size: 16px; font-weight: 950; }
        .px-homeReasonGrid p { color: #64748b; font-size: 13px; font-weight: 760; line-height: 1.4; margin: 0; }
        .px-homeJoinButton { justify-self: start; }
        .px-homeSponsors { background: linear-gradient(135deg, rgba(2,6,23,.98), rgba(6,27,58,.96)); border: 1px solid rgba(103,232,249,.14); border-radius: 24px; overflow: hidden; padding: 14px; }
        .px-homeSponsorTrack { display: grid; gap: 12px; grid-template-columns: repeat(4,minmax(0,1fr)); }
        .px-homeSponsorTrack a { align-items: center; background: rgba(255,255,255,.94); border-radius: 18px; color: #061b3a; display: grid; gap: 8px; min-height: 112px; padding: 12px; text-align: center; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .px-homeSponsorTrack img { height: 56px; object-fit: contain; width: 100%; }
        .px-homeSponsorTrack span { font-size: 24px; font-weight: 950; }
        .px-homeSponsorTrack strong { font-size: 13px; font-weight: 950; }
        .px-homeEmpty { background: rgba(255,255,255,.88); border: 1px dashed rgba(15,23,42,.14); border-radius: 18px; color: #64748b; font-size: 13px; font-weight: 760; padding: 18px; }
        @media (max-width: 1080px) {
          .px-homeNewsPortalGrid, .px-homeRankingClubGrid, .px-homeClubCards { grid-template-columns: 1fr; }
          .px-homeActivityGrid, .px-homeTournamentCards, .px-homeReasonGrid, .px-homeSponsorTrack { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @media (max-width: 720px) {
          .px-homeHeroCompact { border-radius: 22px; grid-template-columns: 1fr; min-height: 220px; padding: 20px; }
          .px-homeHeroCompact h1 { font-size: clamp(34px, 10vw, 44px); }
          .px-homeHeroCompact p { font-size: 15px; }
          .px-homeHeroActions { grid-template-columns: 1fr; }
          .px-homeCtaBanners, .px-homeActivityGrid, .px-homeReasonGrid, .px-homeSponsorTrack { grid-template-columns: 1fr; }
          .px-homeTournamentCards { display: grid; gap: 12px; grid-template-columns: 1fr; margin: 0; overflow: visible; padding: 0; }
          .px-homeTournamentCards :global(.TournamentPublicCard) { height: 326px; min-height: 326px; }
          .px-homeCtaBanners a { grid-template-columns: 64px minmax(0,1fr); min-height: 108px; }
          .px-homeCtaBanners em { grid-column: 2; justify-self: start; margin-right: 0; }
          .px-homeSectionHead.is-row { align-items: start; flex-direction: column; }
          .px-homeNewsPortalGrid, .px-homeMoreNews { grid-template-columns: 1fr; }
          .px-homeMainNews { min-height: 260px; }
          .px-homeAdStripThin a, .px-homeAdStripThin > div { grid-template-columns: 1fr; }
          .px-homeAdStripThin img { width: 100%; }
          .px-homeTournamentCards article:not(.TournamentPublicCard) { grid-template-columns: 1fr; }
          .px-homeDateBlock { align-items: center; display: flex; gap: 9px; justify-content: flex-start; min-height: 0; }
          .px-homeRankingClubCard { grid-template-columns: 56px minmax(0,1fr); }
          .px-homeRankingClubCard b { grid-column: 1 / -1; }
        }
      `}</style>
    </div>
  )
}
