'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { BRAND } from '@/lib/branding'

type NewsItem = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  body: string | null
  cover_url: string | null
  gallery_urls: string[] | null
  placement: 'HERO' | 'GRID' | 'ARCHIVE'
  status?: string | null
  published_at: string | null
  updated_at?: string | null
  club_name?: string | null
  clubName?: string | null
  source?: string | null
  theme_key?: string | null
  themeKey?: string | null
  club_theme_key?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function placementLabel(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'Destacada'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Grilla'
}

function placementBadgeClass(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'px-publicPlacement px-publicPlacement--hero'
  if (placement === 'ARCHIVE') return 'px-publicPlacement px-publicPlacement--archive'
  return 'px-publicPlacement px-publicPlacement--grid'
}

function getExcerpt(item: NewsItem, fallback: string) {
  const source = item.excerpt || item.body || fallback
  const clean = source.replace(/\s+/g, ' ').trim()
  if (clean.length <= 145) return clean
  return `${clean.slice(0, 142).trim()}...`
}

function newsSourceLabel(item: NewsItem) {
  return String(item.club_name ?? item.clubName ?? item.source ?? BRAND.name).toUpperCase()
}

const NEWS_THEME_COLORS: Record<string, { accent: string; accent2: string; glow: string }> = {
  cyan: { accent: '#22d3ee', accent2: '#ec4899', glow: 'rgba(34,211,238,.30)' },
  magenta: { accent: '#ec4899', accent2: '#22d3ee', glow: 'rgba(236,72,153,.28)' },
  indigo: { accent: '#6366f1', accent2: '#22d3ee', glow: 'rgba(99,102,241,.26)' },
  emerald: { accent: '#10b981', accent2: '#22d3ee', glow: 'rgba(16,185,129,.24)' },
  limeNavy: { accent: '#a3e635', accent2: '#22d3ee', glow: 'rgba(163,230,53,.22)' },
  royalCyan: { accent: '#2563eb', accent2: '#22d3ee', glow: 'rgba(37,99,235,.24)' },
}

function newsThemeStyle(item: NewsItem): CSSProperties {
  const key = String(item.theme_key ?? item.themeKey ?? item.club_theme_key ?? 'cyan')
  const theme = NEWS_THEME_COLORS[key] ?? NEWS_THEME_COLORS.cyan
  return {
    ['--news-accent' as string]: theme.accent,
    ['--news-accent-2' as string]: theme.accent2,
    ['--news-glow' as string]: theme.glow,
  }
}

export default function PublicNewsExperience({
  hero,
  grid,
  archive,
  title,
  subtitle,
}: {
  hero: NewsItem | null
  grid: NewsItem[]
  archive: NewsItem[]
  title: string
  subtitle: string
  compactHeader?: boolean
}) {
  const router = useRouter()

  const topIds = useMemo(() => new Set([hero?.id, ...grid.map((item) => item.id)].filter(Boolean)), [hero?.id, grid])
  const latest = useMemo(() => archive.filter((item) => !topIds.has(item.id)).slice(0, 6), [archive, topIds])
  const sideNews = grid.slice(0, 2)
  const gridRemainder = grid.slice(2)

  function openNews(item: NewsItem) {
    router.push(`/noticias/${item.slug}`)
  }

  return (
    <div className="px-publicNewsSurface">
      <section className="px-publicNewsHero">
        <span>Comunidad {BRAND.name.toUpperCase()}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>

      <div className="px-publicNewsStack">
        {hero ? (
          <section className="px-publicEditorialBoard" aria-label="Noticias destacadas">
            <article className="px-publicEditorialMain px-publicInteractive" style={newsThemeStyle(hero)} onClick={() => openNews(hero)}>
              <div className="px-publicEditorialMedia">
                {hero.cover_url ? <img src={hero.cover_url} alt={hero.title} /> : <div className="publicNewsTileFallback" />}
              </div>
              <span className="px-publicNewsBadge">{newsSourceLabel(hero)}</span>
              <time className="px-publicNewsDateChip">{formatDate(hero.published_at || hero.updated_at)}</time>
              <div className="px-publicEditorialOverlay">
                <span className="px-publicNewsKicker">Última noticia</span>
                <h2>{hero.title}</h2>
                <p>{getExcerpt(hero, `Última novedad institucional de ${BRAND.name.toUpperCase()}.`)}</p>
                <span className="px-publicNewsCta">Leer noticia <b>→</b></span>
              </div>
            </article>
            {sideNews.length ? (
              <div className="px-publicEditorialSide">
                {sideNews.map((item) => (
                  <article key={item.id} className="px-publicEditorialSideCard px-publicInteractive" style={newsThemeStyle(item)} onClick={() => openNews(item)}>
                    {item.cover_url ? <img src={item.cover_url} alt="" /> : <div className="publicNewsTileFallback" />}
                    <span className="px-publicNewsBadge">{newsSourceLabel(item)}</span>
                    <time className="px-publicNewsDateChip">{formatDate(item.published_at || item.updated_at)}</time>
                    <strong>{item.title}</strong>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {gridRemainder.length ? (
          <section className="px-publicSection">
            <div className="px-publicSectionHead">
              <div>
                <span>Actualidad</span>
                <h3>Últimas noticias</h3>
              </div>
            </div>
            <div className="px-publicLatestGrid">
              {gridRemainder.map((item) => (
                <article key={item.id} className="px-publicNewsCard px-publicInteractive" style={newsThemeStyle(item)} onClick={() => openNews(item)}>
                  <div className="px-publicNewsMedia">
                    {item.cover_url ? <img src={item.cover_url} alt={item.title} /> : <div className="publicNewsTileFallback" />}
                    <span className="px-publicNewsBadge">{newsSourceLabel(item)}</span>
                    <time className="px-publicNewsDateChip">{formatDate(item.published_at || item.updated_at)}</time>
                  </div>
                  <div className="px-publicNewsBody">
                    <h3>{item.title}</h3>
                    <p>{getExcerpt(item, 'Novedad de la comunidad deportiva.')}</p>
                    <span className="px-publicNewsCta">Leer noticia <b>→</b></span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {latest.length ? (
          <section className="px-publicSection">
            <div className="px-publicSectionHead">
              <div>
                <span>Archivo</span>
                <h3>Archivo reciente</h3>
              </div>
            </div>
            <div className="px-publicArchiveList">
              {latest.map((item) => (
                <article key={item.id} className="px-publicArchiveItem px-publicInteractive" onClick={() => openNews(item)}>
                  <div className="px-publicArchiveMeta">
                    <span className={placementBadgeClass(item.placement)}>{placementLabel(item.placement)}</span>
                    <strong>{item.title}</strong>
                    <p>{getExcerpt(item, 'Sin bajada disponible.')}</p>
                  </div>
                  <time>{formatDate(item.published_at || item.updated_at)}</time>
                  <span className="px-publicArchiveAction">Leer <b>→</b></span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {!hero && !grid.length && !latest.length ? (
          <section className="px-publicNewsEmpty">
            <strong>Todavía no hay noticias públicas</strong>
            <p>Cuando {BRAND.name.toUpperCase()} o los clubes publiquen contenido, va a aparecer en esta portada editorial.</p>
          </section>
        ) : null}
      </div>

      <style jsx>{`
        .px-publicNewsSurface { display: grid; gap: clamp(14px, 2.4vw, 22px); max-width: 100%; min-width: 0; overflow: hidden; }
        .px-publicNewsHero { background: radial-gradient(circle at 12% 0%, rgba(34,211,238,.16), transparent 34%), linear-gradient(135deg, #020617, #061b3a 58%, #0f172a); border: 1px solid rgba(103,232,249,.12); border-radius: 20px; box-shadow: 0 16px 38px rgba(2,6,23,.13); color: #fff; overflow: hidden; padding: clamp(16px, 3vw, 26px); position: relative; }
        .px-publicNewsHero::after { background: linear-gradient(90deg, #22d3ee 0%, #2563eb 50%, #ec4899 100%); bottom: 0; content: ""; height: 3px; left: 20px; position: absolute; right: 20px; }
        .px-publicNewsHero span { color: #67e8f9; font-size: 11px; font-weight: 950; letter-spacing: .10em; text-transform: uppercase; }
        .px-publicNewsHero h1 { font-size: clamp(30px, 4.8vw, 48px); font-weight: 950; letter-spacing: -.055em; line-height: .94; margin: 4px 0; }
        .px-publicNewsHero p { color: rgba(255,255,255,.78); font-size: clamp(13px, 1.9vw, 15px); font-weight: 700; line-height: 1.35; margin: 0; max-width: 620px; }
        .px-publicNewsStack { display: grid; gap: clamp(14px, 2.4vw, 22px); max-width: 100%; min-width: 0; }
        .px-publicInteractive { cursor: pointer; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-publicInteractive:hover { transform: translateY(-2px); }
        .px-publicInteractive img { transition: transform 220ms ease, filter 220ms ease; }
        .px-publicInteractive:hover img { filter: saturate(1.03) contrast(1.02); transform: scale(1.025); }
        .px-publicEditorialBoard { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.24fr) minmax(290px, .76fr); max-width: 100%; min-width: 0; overflow: hidden; }
        .px-publicEditorialMain, .px-publicEditorialSideCard { background: #061226; border: 1px solid color-mix(in srgb, var(--news-accent, #22d3ee) 28%, rgba(255,255,255,.16)); box-shadow: 0 18px 46px rgba(2,6,23,.12), 0 0 0 1px rgba(255,255,255,.02) inset; color: #fff; overflow: hidden; position: relative; }
        .px-publicEditorialMain { border-radius: 0; min-height: clamp(285px, 31vw, 390px); }
        .px-publicEditorialSide { display: grid; gap: 12px; max-width: 100%; min-width: 0; overflow: hidden; }
        .px-publicEditorialSideCard { border-radius: 0; min-height: 0; padding: 16px; }
        .px-publicEditorialMedia, .px-publicEditorialSideCard img, .px-publicEditorialSideCard .publicNewsTileFallback { height: 100%; inset: 0; position: absolute; width: 100%; }
        .px-publicEditorialMedia img, .px-publicEditorialMedia .publicNewsTileFallback, .px-publicEditorialSideCard img, .px-publicEditorialSideCard .publicNewsTileFallback { display: block; height: 100%; object-fit: cover; width: 100%; }
        .px-publicEditorialMain::before, .px-publicEditorialSideCard::before { background: linear-gradient(90deg, color-mix(in srgb, var(--news-accent, #22d3ee) 18%, transparent) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 46px 46px; content: ""; inset: 0; opacity: .34; pointer-events: none; position: absolute; z-index: 1; }
        .px-publicEditorialMain::after, .px-publicEditorialSideCard::after { background: linear-gradient(180deg, rgba(2,6,23,.02) 0%, rgba(2,6,23,.28) 40%, rgba(2,6,23,.86) 100%); content: ""; inset: 0; pointer-events: none; position: absolute; z-index: 1; }
        .px-publicEditorialMain:hover, .px-publicEditorialSideCard:hover { border-color: color-mix(in srgb, var(--news-accent, #22d3ee) 58%, rgba(255,255,255,.22)); box-shadow: 0 24px 58px rgba(2,6,23,.18), 0 0 32px var(--news-glow, rgba(34,211,238,.2)); }
        .px-publicEditorialOverlay { bottom: 0; display: grid; gap: 8px; left: 0; padding: clamp(16px, 2.5vw, 22px); position: absolute; right: 0; z-index: 2; }
        .px-publicEditorialOverlay h2 { font-size: clamp(27px, 4.2vw, 43px); font-weight: 950; letter-spacing: -.055em; line-height: .98; margin: 0; max-width: 20ch; text-wrap: balance; }
        .px-publicEditorialOverlay p { color: rgba(255,255,255,.82); display: -webkit-box; font-size: clamp(12px, 1.55vw, 14px); font-weight: 750; line-height: 1.38; margin: 0; max-width: 64ch; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
        .px-publicEditorialSideCard { align-content: end; display: grid; min-height: 188px; padding: 18px; }
        .px-publicEditorialSideCard strong { font-size: clamp(18px, 2.3vw, 23px); font-weight: 950; letter-spacing: -.045em; line-height: 1.04; max-width: 18ch; position: relative; text-wrap: balance; z-index: 2; }
        .px-publicNewsBadge { align-items: center; background: linear-gradient(135deg, rgba(2,6,23,.9), rgba(6,27,58,.82)); border: 1px solid color-mix(in srgb, var(--news-accent, #22d3ee) 44%, rgba(255,255,255,.22)); color: #fff; display: inline-flex; font-size: 10px; font-weight: 950; gap: 8px; letter-spacing: .08em; line-height: 1; padding: 8px 10px; position: absolute; text-transform: uppercase; top: 14px; left: 14px; z-index: 3; }
        .px-publicNewsBadge::before { background: linear-gradient(180deg, var(--news-accent, #22d3ee), var(--news-accent-2, #ec4899)); border-radius: 99px; content: ""; height: 18px; width: 3px; }
        .px-publicNewsDateChip { align-items: center; background: rgba(2,6,23,.72); border: 1px solid color-mix(in srgb, var(--news-accent, #22d3ee) 34%, rgba(255,255,255,.18)); color: rgba(255,255,255,.9); display: inline-flex; font-size: 10px; font-weight: 950; letter-spacing: .06em; line-height: 1; padding: 7px 9px; position: absolute; right: 14px; text-transform: uppercase; top: 14px; z-index: 3; }
        .px-publicNewsKicker { color: color-mix(in srgb, var(--news-accent, #67e8f9) 74%, white); font-size: 11px; font-weight: 950; letter-spacing: .1em; text-transform: uppercase; }
        .px-publicEditorialOverlay .px-publicNewsCta { color: color-mix(in srgb, var(--news-accent, #67e8f9) 76%, white); width: fit-content; }
        .px-publicNewsCta, .px-publicArchiveAction { align-items: center; color: #061b3a; display: inline-flex; font-size: 13px; font-weight: 950; gap: 6px; text-decoration: none; }
        .px-publicNewsCta b, .px-publicArchiveAction b { display: inline-block; transition: transform 160ms ease; }
        .px-publicInteractive:hover .px-publicNewsCta b, .px-publicInteractive:hover .px-publicArchiveAction b { transform: translateX(3px); }
        .px-publicSection { display: grid; gap: 12px; }
        .px-publicSectionHead { align-items: end; display: flex; justify-content: space-between; }
        .px-publicSectionHead span { color: #0891b2; display: block; font-size: 11px; font-weight: 950; letter-spacing: .10em; text-transform: uppercase; }
        .px-publicSectionHead h3 { color: #061b3a; font-size: clamp(24px, 3vw, 32px); font-weight: 950; letter-spacing: -.045em; line-height: 1; margin: 3px 0 0; }
        .px-publicLatestGrid { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); max-width: 100%; min-width: 0; overflow: hidden; }
        .px-publicNewsCard { background: #061226; border: 1px solid color-mix(in srgb, var(--news-accent, #22d3ee) 22%, rgba(255,255,255,.16)); box-shadow: 0 14px 34px rgba(2,6,23,.09); color: #fff; display: grid; min-height: 315px; overflow: hidden; position: relative; }
        .px-publicNewsCard:hover { border-color: color-mix(in srgb, var(--news-accent, #22d3ee) 48%, rgba(255,255,255,.2)); box-shadow: 0 18px 44px rgba(2,6,23,.14), 0 0 26px var(--news-glow, rgba(34,211,238,.16)); }
        .px-publicNewsMedia { background: #0f172a; inset: 0; overflow: hidden; position: absolute; }
        .px-publicNewsMedia img, .px-publicNewsMedia .publicNewsTileFallback { display: block; height: 100%; object-fit: cover; width: 100%; }
        .px-publicNewsMedia::after { background: linear-gradient(180deg, rgba(2,6,23,.04) 0%, rgba(2,6,23,.36) 42%, rgba(2,6,23,.9) 100%); content: ""; inset: 0; position: absolute; }
        .px-publicNewsBody { align-content: end; display: grid; gap: 8px; padding: 18px; position: relative; z-index: 2; }
        .px-publicNewsBody h3 { color: #fff; font-size: 21px; font-weight: 950; letter-spacing: -.04em; line-height: 1.06; margin: 0; text-wrap: balance; }
        .px-publicNewsBody p { color: rgba(255,255,255,.76); display: -webkit-box; font-size: 13px; font-weight: 650; line-height: 1.4; margin: 0; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
        .px-publicNewsBody .px-publicNewsCta { color: color-mix(in srgb, var(--news-accent, #67e8f9) 76%, white); margin-top: 2px; }
        .px-publicArchiveList { background: rgba(255,255,255,.76); border: 1px solid rgba(15,23,42,.08); border-radius: 16px; box-shadow: 0 10px 26px rgba(15,23,42,.05); display: grid; overflow: hidden; }
        .px-publicArchiveItem { align-items: center; background: #fff; border-bottom: 1px solid rgba(226,232,240,.82); display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) max-content max-content; padding: 11px 14px; }
        .px-publicArchiveItem:last-child { border-bottom: 0; }
        .px-publicArchiveItem:hover { background: #f8fafc; box-shadow: none; transform: none; }
        .px-publicArchiveMeta { display: grid; gap: 5px; min-width: 0; }
        .px-publicArchiveMeta strong { color: #061b3a; font-size: 15px; font-weight: 950; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-publicArchiveMeta p { color: #64748b; font-size: 12px; font-weight: 650; line-height: 1.35; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .px-publicPlacement { align-items: center; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.34); border-radius: 999px; display: inline-flex; font-size: 11px; font-weight: 950; justify-content: center; min-height: 25px; padding: 0 10px; width: fit-content; }
        .px-publicPlacement--hero { background: rgba(6,27,58,.82); color: #fff; }
        .px-publicPlacement--grid { background: rgba(255,255,255,.88); color: #075985; }
        .px-publicPlacement--archive { background: rgba(241,245,249,.92); border-color: rgba(148,163,184,.24); color: #475569; }
        .publicNewsTileFallback { background: radial-gradient(circle at 16% 0%, rgba(34,211,238,.16), transparent 34%), linear-gradient(135deg, #0f172a, #1e293b); }
        .px-publicNewsEmpty { background: #fff; border: 1px dashed rgba(15,23,42,.14); border-radius: 18px; color: rgba(23,37,63,.68); display: grid; gap: 6px; padding: 24px; }
        .px-publicNewsEmpty strong { color: #061b3a; font-size: 20px; font-weight: 950; }
        .px-publicNewsEmpty p { margin: 0; }
        @media (max-width: 1080px) {
          .px-publicEditorialBoard { grid-template-columns: 1fr; }
          .px-publicEditorialSide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .px-publicLatestGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .px-publicNewsHero { border-radius: 18px; padding: 15px 14px 18px; }
          .px-publicNewsHero::after { left: 16px; right: 16px; }
          .px-publicEditorialMain { min-height: 315px; }
          .px-publicEditorialSide { grid-template-columns: 1fr; }
          .px-publicEditorialSideCard { min-height: 210px; padding: 17px; }
          .px-publicEditorialOverlay { padding: 17px 15px; }
          .px-publicEditorialOverlay h2 { font-size: clamp(25px, 7.8vw, 32px); max-width: 17ch; }
          .px-publicEditorialOverlay p { -webkit-line-clamp: 2; }
          .px-publicNewsBadge, .px-publicNewsDateChip { top: 12px; }
          .px-publicNewsBadge { left: 12px; }
          .px-publicNewsDateChip { right: 12px; }
          .px-publicLatestGrid { grid-template-columns: 1fr; }
          .px-publicNewsCard { min-height: 285px; }
          .px-publicArchiveList { background: transparent; border: 0; box-shadow: none; gap: 10px; overflow: visible; }
          .px-publicEditorialMain, .px-publicEditorialSideCard, .px-publicNewsCard { max-width: 100%; min-width: 0; overflow: hidden; }
          .px-publicEditorialMedia img, .px-publicEditorialSideCard img, .px-publicNewsMedia img { max-width: 100%; transform-origin: center; }
          .px-publicArchiveItem { border: 1px solid rgba(15,23,42,.08); border-radius: 14px; box-shadow: 0 8px 20px rgba(15,23,42,.05); gap: 7px; grid-template-columns: 1fr; padding: 12px; }
          .px-publicArchiveMeta strong, .px-publicArchiveMeta p { white-space: normal; }
          .px-publicArchiveAction { margin-top: 2px; }
        }
      `}</style>
    </div>
  )
}
