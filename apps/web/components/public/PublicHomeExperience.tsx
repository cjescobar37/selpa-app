'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

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
  gender: string
  category: number | null
  startDate: string | null
  endDate: string | null
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

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function placementBadgeClass(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'px-homeBadge px-homeBadge--hero'
  if (placement === 'ARCHIVE') return 'px-homeBadge px-homeBadge--archive'
  return 'px-homeBadge px-homeBadge--grid'
}

function placementLabel(placement: NewsItem['placement']) {
  if (placement === 'HERO') return 'Destacada'
  if (placement === 'ARCHIVE') return 'Archivo'
  return 'Grilla'
}

function tournamentStatusLabel(status: string) {
  const value = String(status || '').toUpperCase()
  if (value.includes('OPEN')) return 'Inscripcion abierta'
  if (value.includes('ACTIVE')) return 'Activo'
  if (value.includes('DRAFT')) return 'Proximo'
  return status || 'Torneo'
}

export default function PublicHomeExperience({
  slides,
  newsArchive,
  tournaments,
  ads,
  sponsors,
}: {
  slides: NewsItem[]
  newsArchive: NewsItem[]
  tournaments: TournamentItem[]
  ads: AdItem[]
  sponsors: SponsorItem[]
}) {
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null)

  useEffect(() => {
    if (slides.length <= 1) return
    const id = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length)
    }, 6000)
    return () => window.clearInterval(id)
  }, [slides.length])

  const currentSlide = slides[slideIndex] ?? slides[0] ?? null
  const featuredTournaments = tournaments.slice(0, 4)
  const newsSecondary = useMemo(
    () => newsArchive.filter((item) => !slides.some((slide) => slide.id === item.id)).slice(0, 4),
    [newsArchive, slides],
  )
  const heroAd = ads.find((item) => item.slot === 'HOME_HERO') ?? null
  const inlineAds = ads.filter((item) => item.slot !== 'HOME_HERO').slice(0, 2)

  const rankingCards = [
    { title: 'Ranking público', subtitle: 'Masculino y femenino con filtros', href: '/ranking' },
    { title: 'Top 10 destacado', subtitle: 'Jugadores con más puntos', href: '/ranking' },
    { title: 'Por club y categoría', subtitle: 'Vista pública ordenada', href: '/ranking' },
  ]

  const quickActions = [
    { title: 'Ver torneos', subtitle: 'Agenda y calendario', href: '/torneos' },
    { title: 'Ver ranking', subtitle: 'Posiciones y categorias', href: '/ranking' },
    { title: 'Noticias', subtitle: 'Toda la cobertura', href: '/noticias' },
    { title: 'Clubes', subtitle: 'Explorar clubes', href: '/clubs' },
    { title: 'En vivo', subtitle: 'Actividad destacada', href: '/buscar' },
  ]

  return (
    <div className="px-homeSurface">
      <section className="px-homeHero">
        {currentSlide ? (
          <div className="px-homeHeroFrame">
            <article
              className="px-homeHeroMedia"
              onClick={() => setSelectedNews(currentSlide)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedNews(currentSlide)
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Abrir noticia ${currentSlide.title}`}
            >
              {currentSlide.cover_url ? <img src={currentSlide.cover_url} alt={currentSlide.title} className="px-homeHeroImage" /> : <div className="px-homeHeroFallback" />}
              <div className="px-homeHeroOverlay">
                <span className={placementBadgeClass(currentSlide.placement)}>{placementLabel(currentSlide.placement)}</span>
                <h1>{currentSlide.title}</h1>
                <p>{currentSlide.excerpt || 'Segui la cobertura institucional y deportiva de Pamprax.'}</p>
                <div className="px-homeHeroMeta">
                  <span>{formatDate(currentSlide.published_at || currentSlide.updated_at)}</span>
                </div>
                <div className="px-homeHeroCta">
                  <Link href="/login" onClick={(event) => event.stopPropagation()}>Ingresar</Link>
                  <Link href="/register" onClick={(event) => event.stopPropagation()}>Registrarme</Link>
                </div>
              </div>

              <div className="px-homeHeroControls" aria-label="Controles del carrusel">
                <span
                  role="button"
                  tabIndex={0}
                  className="px-homeArrow"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSlideIndex((slideIndex - 1 + slides.length) % slides.length)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      setSlideIndex((slideIndex - 1 + slides.length) % slides.length)
                    }
                  }}
                  aria-label="Anterior"
                >
                  ‹
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  className="px-homeArrow"
                  onClick={(event) => {
                    event.stopPropagation()
                    setSlideIndex((slideIndex + 1) % slides.length)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      setSlideIndex((slideIndex + 1) % slides.length)
                    }
                  }}
                  aria-label="Siguiente"
                >
                  ›
                </span>
              </div>

              <div className="px-homeHeroDots">
                {slides.map((slide, index) => (
                  <span
                    key={slide.id}
                    role="button"
                    tabIndex={0}
                    className={`px-homeDot ${index === slideIndex ? 'is-active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSlideIndex(index)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        setSlideIndex(index)
                      }
                    }}
                    aria-label={`Ir a noticia ${index + 1}`}
                  />
                ))}
              </div>
            </article>
          </div>
        ) : (
          <div className="px-homeHeroFrame">
            <div className="px-homeHeroMedia px-homeHeroMedia--fallback">
              <div className="px-homeHeroOverlay">
                <span className="px-homeBadge px-homeBadge--hero">Pamprax</span>
                <h1>Tu circuito de pádel, ordenado y vivo</h1>
                <p>Torneos, ranking, noticias y operación deportiva en una experiencia premium para clubes y jugadores.</p>
                <div className="px-homeHeroCta">
                  <Link href="/login">Ingresar</Link>
                  <Link href="/register">Registrarme</Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="px-homeGrid">
        <div className="px-homeColumn px-homeColumn--primary">
          <article className="px-homeModule px-homeModule--tournaments">
            <div className="px-homeModuleHead">
              <div>
                <h3>Torneos en foco</h3>
                <p>Proximos eventos, fechas activas y agenda del circuito.</p>
              </div>
              <Link href="/torneos" className="px-btn px-btn--ghost">Ver torneos</Link>
            </div>
            {featuredTournaments.length ? (
              <div className="px-homeTournamentGrid">
                {featuredTournaments.map((item, index) => (
                  <article key={item.id} className={`px-homeTournamentCard ${index === 0 ? 'is-featured' : ''}`}>
                    <div className="px-homeTournamentTop">
                      <span className="px-homeBadge px-homeBadge--grid">{tournamentStatusLabel(item.status)}</span>
                      <span>{item.gender}</span>
                    </div>
                    <strong>{item.name}</strong>
                    <p>{item.format} {item.category ? `• Cat ${item.category}` : ''}</p>
                    <div className="px-homeTournamentMeta">
                      <span>Inicio {formatDate(item.startDate)}</span>
                      {item.endDate ? <span>Fin {formatDate(item.endDate)}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-homeEmpty">Todavia no hay torneos publicados para mostrar en portada.</div>
            )}
          </article>

          <div className="px-homeSplit">
            <article className="px-homeModule">
              <div className="px-homeModuleHead">
                <div>
                  <h3>Ranking destacado</h3>
                  <p>Entradas rapidas a las vistas mas consultadas.</p>
                </div>
              </div>
              <div className="px-homeRankingList">
                {rankingCards.map((item, index) => (
                  <Link key={item.title} href={item.href} className="px-homeRankingCard">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </article>

            <article className="px-homeModule">
              <div className="px-homeModuleHead">
                <div>
                  <h3>Accesos rapidos</h3>
                  <p>Puertas principales de la plataforma.</p>
                </div>
              </div>
              <div className="px-homeQuickGrid">
                {quickActions.map((item) => (
                  <Link key={item.title} href={item.href} className="px-homeQuickCard">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </Link>
                ))}
              </div>
            </article>
          </div>
        </div>

        <div className="px-homeColumn px-homeColumn--secondary">
          <article className="px-homeModule">
            <div className="px-homeModuleHead">
              <div>
                <h3>Novedades</h3>
                <p>Lo que sigue despues del bloque principal.</p>
              </div>
              <Link href="/noticias" className="px-btn px-btn--ghost">Abrir archivo</Link>
            </div>
            <div className="px-homeNewsRail">
              {newsSecondary.map((item) => (
                <article key={item.id} className="px-homeNewsMini px-homeInteractive" onClick={() => setSelectedNews(item)}>
                  <div className="px-homeNewsMiniThumb">{item.cover_url ? <img src={item.cover_url} alt={item.title} /> : <div />}</div>
                  <div className="px-homeNewsMiniBody">
                    <span className={placementBadgeClass(item.placement)}>{placementLabel(item.placement)}</span>
                    <strong>{item.title}</strong>
                    <p>{formatDate(item.published_at || item.updated_at)}</p>
                  </div>
                </article>
              ))}
            </div>
          </article>

          {heroAd ? (
            <article className="px-homeModule px-homeAdCard">
              <span className="px-homeBadge px-homeBadge--archive">Publicidad</span>
              {heroAd.image_url ? <img src={heroAd.image_url} alt={heroAd.title} className="px-homeAdImage" /> : null}
              <div className="px-homeAdBody">
                <strong>{heroAd.title}</strong>
                {heroAd.description ? <p>{heroAd.description}</p> : null}
                <a href={heroAd.link_url || '#'} target="_blank" rel="noreferrer" className="px-btn px-btn--ghost">Ver propuesta</a>
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="px-homeCommercial">
        {inlineAds.length ? (
          <div className="px-homeAdStrip">
            {inlineAds.map((item) => (
              <a key={item.id} className="px-homeInlineAd px-homeInteractive" href={item.link_url || '#'} target="_blank" rel="noreferrer">
                {item.image_url ? <img src={item.image_url} alt={item.title} /> : null}
                <div>
                  <span className="px-homeBadge px-homeBadge--archive">Publicidad</span>
                  <strong>{item.title}</strong>
                  <p>{item.description || 'Campana activa en portada.'}</p>
                </div>
              </a>
            ))}
          </div>
        ) : null}

        <article className="px-homeModule px-homeSponsors">
          <div className="px-homeModuleHead">
            <div>
              <h3>Sponsors oficiales</h3>
              <p>Marcas y aliados presentes en la portada.</p>
            </div>
          </div>
          <div className="px-homeSponsorStrip">
            {sponsors.length ? sponsors.map((item) => (
              <a key={item.id} className="px-homeSponsorCard px-homeInteractive" href={item.website_url || '#'} target="_blank" rel="noreferrer">
                <div className="px-homeSponsorLogo">
                  {item.logo_url ? <img src={item.logo_url} alt={item.name} /> : <span>{item.name.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="px-homeSponsorCopy">
                  <span>{item.tier}</span>
                  <strong>{item.name}</strong>
                </div>
              </a>
            )) : <div className="px-homeEmpty">Todavia no hay sponsors activos.</div>}
          </div>
        </article>
      </section>

      {selectedNews ? (
        <div className="px-homeOverlay" role="dialog" aria-modal="true">
          <div className="px-homeOverlayShell">
            <div className="px-homeOverlayHead">
              <span className={placementBadgeClass(selectedNews.placement)}>{placementLabel(selectedNews.placement)}</span>
              <button type="button" className="px-btn px-btn--ghost" onClick={() => setSelectedNews(null)}>Cerrar noticia</button>
            </div>
            <article className="px-homeOverlayArticle">
              {selectedNews.cover_url ? <img src={selectedNews.cover_url} alt={selectedNews.title} className="px-homeOverlayHero" /> : null}
              <div className="px-homeOverlayBody">
                <h2>{selectedNews.title}</h2>
                {selectedNews.excerpt ? <p className="px-homeOverlayLead">{selectedNews.excerpt}</p> : null}
                <div className="px-homeOverlayCopy">
                  {String(selectedNews.body || 'Sin contenido cargado.')
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
                {Array.isArray(selectedNews.gallery_urls) && selectedNews.gallery_urls.length ? (
                  <div className="px-homeOverlayGallery">
                    {selectedNews.gallery_urls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt={`Galeria ${index + 1}`} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .px-homeSurface { display: grid; gap: 22px; }
        .px-homeHeroFrame { display: grid; grid-template-columns: minmax(0, 1fr); position: relative; padding-top: 4px; }
        .px-homeHeroFrame::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; border-radius: 999px; background: linear-gradient(90deg, rgba(255,78,114,.92), rgba(83,199,217,.92)); }
        .px-homeHeroMedia { position: relative; height: clamp(440px, 50vw, 560px); min-height: 0; border: 0; width: 100%; border-radius: 14px; overflow: hidden; background: #0f172a; cursor: pointer; padding: 0; text-align: left; display: block; }
        .px-homeHeroMedia--fallback { background: radial-gradient(circle at 12% 0%, rgba(34,211,238,.34), transparent 34%), radial-gradient(circle at 86% 20%, rgba(236,72,153,.28), transparent 34%), linear-gradient(135deg, #071a36, #0f274a 58%, #431039); cursor: default; }
        .px-homeHeroImage { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 280ms ease, filter 280ms ease; }
        .px-homeHeroMedia:hover .px-homeHeroImage { transform: scale(1.03); filter: saturate(1.06) contrast(1.04); }
        .px-homeHeroFallback { position: absolute; inset: 0; background: linear-gradient(135deg, #0f172a, #1d4ed8); }
        .px-homeHeroOverlay { position: absolute; inset: auto 0 0 0; min-height: 46%; padding: 30px; display: grid; align-content: end; gap: 12px; background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.64) 56%, rgba(15,23,42,0.94) 100%); color: #fff; transition: background 220ms ease; }
        .px-homeHeroMedia:hover .px-homeHeroOverlay { background: linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.7) 56%, rgba(15,23,42,0.96) 100%); }
        .px-homeHeroOverlay h1 { margin: 0; max-width: 72%; font-size: clamp(34px, 4.4vw, 62px); line-height: 0.98; text-wrap: balance; text-decoration: underline; text-decoration-color: transparent; text-decoration-thickness: 2px; text-underline-offset: 8px; transition: text-decoration-color 180ms ease; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .px-homeHeroMedia:hover .px-homeHeroOverlay h1 { text-decoration-color: rgba(255,255,255,.72); }
        .px-homeHeroOverlay p { margin: 0; max-width: 58%; font-size: 16px; line-height: 1.5; color: rgba(255,255,255,.84); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .px-homeHeroMeta { font-size: 13px; color: rgba(255,255,255,.76); }
        .px-homeHeroCta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
        .px-homeHeroCta a { border-radius: 999px; font-size: 13px; font-weight: 950; padding: 10px 14px; text-decoration: none; }
        .px-homeHeroCta a:first-child { background: #fff; color: #061b3a; }
        .px-homeHeroCta a:last-child { background: linear-gradient(135deg, #06b6d4, #ec4899); color: #fff; }
        .px-homeHeroControls { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; pointer-events: none; }
        .px-homeArrow { width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.28); background: rgba(15,23,42,.48); backdrop-filter: blur(12px); color: #fff; display: grid; place-items: center; font-size: 28px; line-height: 1; pointer-events: auto; transition: transform 180ms ease, background 180ms ease, border-color 180ms ease; }
        .px-homeArrow:hover { transform: scale(1.06); background: rgba(15,23,42,.72); border-color: rgba(255,255,255,.44); }
        .px-homeHeroDots { position: absolute; left: 30px; bottom: 18px; display: flex; gap: 8px; }
        .px-homeDot { width: 28px; height: 4px; border-radius: 999px; background: rgba(255,255,255,.34); transition: width 180ms ease, background 180ms ease; }
        .px-homeDot.is-active { width: 46px; background: #fff; }
        .px-homeGrid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr); gap: 18px; }
        .px-homeColumn { display: grid; gap: 18px; }
        .px-homeModule { border: 1px solid rgba(15,23,42,.08); border-radius: 14px; background: #fff; padding: 16px; display: grid; gap: 14px; position: relative; overflow: hidden; }
        .px-homeModule--tournaments::before, .px-homeAdCard::before, .px-homeSponsors::before { content: ""; position: absolute; left: 16px; right: 16px; top: 0; height: 2px; border-radius: 999px; background: linear-gradient(90deg, rgba(255,78,114,.82), rgba(83,199,217,.82)); opacity: .64; }
        .px-homeModuleHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .px-homeModuleHead h3 { margin: 0; font-size: 18px; }
        .px-homeModuleHead p { margin: 2px 0 0; font-size: 13px; color: rgba(23,37,63,.62); }
        .px-homeTournamentGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .px-homeTournamentCard { border: 1px solid rgba(15,23,42,.08); border-radius: 12px; padding: 14px; background: linear-gradient(180deg, #fff, rgba(248,250,252,.92)); display: grid; gap: 8px; }
        .px-homeTournamentCard.is-featured { grid-column: span 2; min-height: 180px; background: linear-gradient(135deg, rgba(15,23,42,.98), rgba(16,185,129,.86)); color: #fff; }
        .px-homeTournamentTop { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: inherit; }
        .px-homeTournamentCard strong { font-size: 18px; line-height: 1.1; }
        .px-homeTournamentCard p { margin: 0; font-size: 13px; color: inherit; opacity: 0.82; }
        .px-homeTournamentMeta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: inherit; opacity: 0.78; }
        .px-homeSplit { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
        .px-homeRankingList, .px-homeQuickGrid, .px-homeNewsRail { display: grid; gap: 10px; }
        .px-homeRankingCard { display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 10px; align-items: start; padding: 12px; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-homeRankingCard:hover, .px-homeQuickCard:hover, .px-homeNewsMini:hover, .px-homeInlineAd:hover, .px-homeSponsorCard:hover { transform: translateY(-2px); box-shadow: 0 16px 28px rgba(15,23,42,.08); border-color: rgba(16,185,129,.22); }
        .px-homeRankingCard span { font-size: 11px; color: rgba(23,37,63,.52); }
        .px-homeRankingCard strong, .px-homeQuickCard strong, .px-homeNewsMiniBody strong { font-size: 14px; line-height: 1.2; color: #0f172a; }
        .px-homeRankingCard p, .px-homeQuickCard span, .px-homeNewsMiniBody p { margin: 2px 0 0; font-size: 12px; color: rgba(23,37,63,.62); }
        .px-homeQuickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .px-homeQuickCard { padding: 12px; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; display: grid; gap: 6px; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-homeNewsMini { display: grid; grid-template-columns: 88px minmax(0,1fr); gap: 10px; border: 1px solid rgba(15,23,42,.08); border-radius: 10px; padding: 8px; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; cursor: pointer; }
        .px-homeNewsMiniThumb, .px-homeNewsMiniThumb img, .px-homeAdImage { width: 100%; height: 100%; display: block; object-fit: cover; }
        .px-homeNewsMiniThumb { height: 72px; border-radius: 8px; overflow: hidden; background: rgba(148,163,184,.16); }
        .px-homeNewsMiniBody { display: grid; gap: 6px; align-content: center; }
        .px-homeAdCard { overflow: hidden; }
        .px-homeAdImage { height: 220px; border-radius: 12px; }
        .px-homeAdBody { display: grid; gap: 8px; }
        .px-homeAdBody strong { font-size: 18px; }
        .px-homeAdBody p { margin: 0; color: rgba(23,37,63,.66); font-size: 13px; line-height: 1.45; }
        .px-homeCommercial { display: grid; gap: 16px; }
        .px-homeAdStrip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .px-homeInlineAd { display: grid; grid-template-columns: 180px minmax(0,1fr); gap: 12px; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; padding: 12px; background: #fff; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-homeInlineAd img { width: 100%; height: 116px; object-fit: cover; border-radius: 10px; }
        .px-homeInlineAd div { display: grid; gap: 8px; align-content: center; }
        .px-homeInlineAd strong { font-size: 16px; }
        .px-homeInlineAd p { margin: 0; font-size: 13px; color: rgba(23,37,63,.62); }
        .px-homeSponsors { gap: 12px; }
        .px-homeSponsorStrip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .px-homeSponsorCard { display: grid; gap: 10px; padding: 12px; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; background: #fff; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; }
        .px-homeSponsorLogo { height: 84px; border-radius: 10px; border: 1px solid rgba(15,23,42,.08); display: grid; place-items: center; overflow: hidden; background: #fff; }
        .px-homeSponsorLogo img { width: 100%; height: 100%; object-fit: contain; padding: 10px; display: block; }
        .px-homeSponsorLogo span { font-size: 24px; color: rgba(23,37,63,.44); font-weight: 700; }
        .px-homeSponsorCopy { display: grid; gap: 4px; }
        .px-homeSponsorCopy span { font-size: 11px; color: rgba(23,37,63,.54); }
        .px-homeSponsorCopy strong { font-size: 14px; line-height: 1.2; }
        .px-homeBadge { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .px-homeBadge--hero { background: rgba(236,72,153,.16); color: #be185d; }
        .px-homeBadge--grid { background: rgba(59,130,246,.12); color: #1d4ed8; }
        .px-homeBadge--archive { background: rgba(100,116,139,.14); color: #475569; }
        .px-homeOverlay { position: fixed; inset: 72px 0 0 0; background: rgba(15,23,42,.72); z-index: 80; padding: 16px; overflow-y: auto; overflow-x: hidden; }
        .px-homeOverlayShell { width: min(920px, 100%); min-height: calc(100vh - 104px); margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; display: grid; grid-template-rows: auto minmax(0,1fr); }
        .px-homeOverlayHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid rgba(15,23,42,.08); background: #fff; position: sticky; top: 0; z-index: 1; }
        .px-homeOverlayArticle { min-height: 0; overflow-y: auto; }
        .px-homeOverlayHero, .px-homeOverlayGallery img { width: 100%; display: block; object-fit: cover; }
        .px-homeOverlayHero { height: 280px; }
        .px-homeOverlayBody { display: grid; gap: 14px; padding: 18px; }
        .px-homeOverlayBody h2 { margin: 0; font-size: 32px; line-height: 1.08; }
        .px-homeOverlayLead { margin: 0; font-size: 18px; line-height: 1.45; color: rgba(23,37,63,.74); }
        .px-homeOverlayCopy { display: grid; gap: 12px; color: #0f172a; font-size: 15px; line-height: 1.72; }
        .px-homeOverlayCopy p { margin: 0; }
        .px-homeOverlayGallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .px-homeOverlayGallery img { aspect-ratio: 4 / 3; border-radius: 8px; }
        .px-homeEmpty { border: 1px dashed rgba(15,23,42,.12); border-radius: 10px; padding: 18px; text-align: center; color: rgba(23,37,63,.6); font-size: 13px; }
        @media (max-width: 1180px) {
          .px-homeGrid { grid-template-columns: 1fr; }
        }
        @media (max-width: 980px) {
          .px-homeTournamentGrid, .px-homeSplit, .px-homeAdStrip, .px-homeSponsorStrip { grid-template-columns: 1fr; }
          .px-homeTournamentCard.is-featured, .px-homeQuickGrid { grid-column: span 1; }
          .px-homeQuickGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .px-homeInlineAd { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .px-homeHeroMedia { height: clamp(360px, 118vw, 440px); }
          .px-homeHeroOverlay { padding: 16px; }
          .px-homeHeroOverlay h1 { max-width: 100%; font-size: clamp(26px, 9vw, 38px); }
          .px-homeHeroOverlay p { max-width: 100%; font-size: 14px; }
          .px-homeHeroControls { padding: 0 10px; }
          .px-homeArrow { width: 36px; height: 36px; font-size: 24px; }
          .px-homeHeroDots { left: 16px; bottom: 12px; }
          .px-homeDot { width: 20px; }
          .px-homeDot.is-active { width: 34px; }
          .px-homeModuleHead { flex-direction: column; align-items: stretch; }
          .px-homeQuickGrid { grid-template-columns: 1fr; }
          .px-homeNewsMini { grid-template-columns: 1fr; }
          .px-homeNewsMiniThumb { height: 180px; }
          .px-homeOverlay { inset: 64px 0 0 0; padding: 0; }
          .px-homeOverlayShell { min-height: calc(100vh - 64px); border-radius: 0; }
          .px-homeOverlayHero { height: 220px; }
          .px-homeOverlayBody { padding: 14px; }
          .px-homeOverlayBody h2 { font-size: 26px; }
          .px-homeOverlayLead { font-size: 16px; }
          .px-homeOverlayGallery { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
