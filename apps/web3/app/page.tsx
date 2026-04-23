'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

type News = { tag: string; title: string; text: string }
type Tour = { name: string; city: string; date: string }
type Rank = { label: string; name: string; pts: number }

export default function PublicHomePage() {
  const newsRef = useRef<HTMLDivElement | null>(null)

  // Carrusel automático (sin librerías)
  useEffect(() => {
    const el = newsRef.current
    if (!el) return

    let dir = 1
    const stepPx = 332 // ancho card 320 + gap aprox

    const tick = () => {
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return

      el.scrollLeft += stepPx * dir

      if (el.scrollLeft >= max - 10) dir = -1
      if (el.scrollLeft <= 10) dir = 1
    }

    const id = window.setInterval(tick, 2600)
    return () => window.clearInterval(id)
  }, [])

  const news: News[] = [
    { tag: 'Noticia', title: 'Nuevo calendario de torneos', text: 'Fechas confirmadas y sedes para las próximas semanas.' },
    { tag: 'Ranking', title: 'Actualización semanal', text: 'Subas y bajas por categoría. Mirá el detalle.' },
    { tag: 'En vivo', title: 'Resultados al instante', text: 'Seguimiento de partidos con carga rápida de resultados.' },
    { tag: 'Club', title: 'Sumá tu club', text: 'Gestioná torneos, ranking interno y pagos desde PAMPRAX.' },
  ]

  const tours: Tour[] = [
    { name: 'Open LA33', city: 'Santa Rosa', date: 'Mar 22–24' },
    { name: 'Copa PAMPRAX', city: 'General Pico', date: 'Abr 5–7' },
    { name: 'Night Cup', city: 'Toay', date: 'Abr 12–13' },
    { name: 'Masters', city: 'Santa Rosa', date: 'May 1–3' },
  ]

  const ranks: Rank[] = [
    { label: 'Masculino', name: '#1 Kun Agüero', pts: 19800 },
    { label: 'Femenino', name: '#1 Jugadora', pts: 15440 },
    { label: 'Mi ranking', name: 'Disponible al iniciar sesión', pts: 0 },
  ]

  return (
    <div className="px-wrap">
      {/* HERO */}
      <div className="px-card px-cardTopAccent">
        <h1 className="px-h1">PAMPRAX</h1>
        <div className="px-muted" style={{ marginTop: 8 }}>
          Ranking • Torneos • Clubes • En vivo
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <Link className="px-btn" href="/torneos">Ver torneos</Link>
          <Link className="px-btn px-btn--ghost" href="/ranking">Ver ranking</Link>
          <Link className="px-btn px-btn--ghost" href="/noticias">Noticias</Link>
          <Link className="px-btn px-btn--magenta" href="/unir-mi-club">Unir mi club</Link>
        </div>

        <div className="px-help" style={{ marginTop: 12 }}>
          <b>Invitado:</b> podés explorar noticias, torneos y rankings. Para inscribirte, pagar o administrar, iniciá sesión.
        </div>
      </div>

      {/* ÚLTIMAS NOTICIAS (CAROUSEL AUTO) */}
      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Últimas noticias</div>
            <div className="public-sub">Novedades, comunicados y actividad reciente.</div>
          </div>
          <Link className="public-actionLink" href="/noticias">Ver todas →</Link>
        </div>

        <div className="carousel">
          <div className="carouselTrack" ref={newsRef}>
            {news.map((n, idx) => (
              <article key={idx} className="px-card px-card--flat carouselItem newsCard">
                <div className="newsMeta">
                  <span className="px-pill" style={{ borderColor: 'rgba(255,78,114,.22)' }}>{n.tag}</span>
                  <span>•</span>
                  <span>PAMPRAX</span>
                </div>
                <div className="newsTitle">{n.title}</div>
                <div className="newsText">{n.text}</div>
                <div style={{ marginTop: 12 }}>
                  <Link className="px-link" href="/noticias">Leer →</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TORNEOS ACTIVOS (GRID sin scroll) */}
      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Torneos activos</div>
            <div className="public-sub">Inscripciones y calendario. (mock por ahora)</div>
          </div>
          <Link className="public-actionLink" href="/torneos">Ver todos →</Link>
        </div>

        <div className="tourGrid">
          {tours.map((t, idx) => (
            <article key={idx} className="px-card px-card--flat tourCard">
              <span className="tourTag">Torneo</span>
              <div className="tourTitle">{t.name}</div>
              <div className="tourMeta">{t.city} • {t.date}</div>
              <Link className="tourCta" href="/torneos">Ver →</Link>
            </article>
          ))}
        </div>
      </section>

      {/* RANKING (cards) */}
      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Ranking</div>
            <div className="public-sub">Masculino / Femenino con selector de categoría dentro.</div>
          </div>
          <Link className="public-actionLink" href="/ranking">Ir al ranking →</Link>
        </div>

        <div className="rankGrid">
          {ranks.map((r, idx) => (
            <article key={idx} className="px-card px-card--flat rankCard">
              <div className="rankSide">
                <div className="rankLabel">{r.label}</div>
                <div className="rankName">{r.name}</div>
                {r.pts ? <div className="rankPts">{r.pts} pts</div> : <div className="px-muted">—</div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                {r.label === 'Mi ranking' ? (
                  <Link className="px-btn" href="/auth/login">Ingresar</Link>
                ) : (
                  <Link className="px-btn px-btn--ghost" href="/ranking">Ver →</Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* SPONSORS */}
      <section className="public-section">
        <div className="public-headerRow">
          <div>
            <div className="public-title">Sponsors & Publicidades</div>
            <div className="public-sub">Espacios para marcas (placeholder). Lo conectamos a BD después.</div>
          </div>
          <button className="px-btn px-btn--ghost" type="button">Quiero publicitar</button>
        </div>

        <div className="sponsorRow">
          {[
            { t: 'Sponsor', n: 'Marca 1', d: 'Banner principal / Home' },
            { t: 'Partner', n: 'Marca 2', d: 'Torneos / Calendario' },
            { t: 'Sponsor', n: 'Marca 3', d: 'Ranking / En vivo' },
            { t: 'Local', n: 'Marca 4', d: 'Card destacada' },
          ].map((s, idx) => (
            <article key={idx} className="px-card px-card--flat sponsorCard">
              <div className="sponsorType">
                <span className="dotMagenta" />
                <span>{s.t}</span>
              </div>
              <div style={{ marginTop: 10, fontWeight: 900 }}>{s.n}</div>
              <div className="px-muted" style={{ marginTop: 4, fontSize: 13 }}>{s.d}</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}