'use client'

import { useEffect, useState } from 'react'
import SelpaLoader from '@/components/SelpaLoader'
import CommunityTournamentCalendar from '@/components/public/CommunityTournamentCalendar'
import PublicHomeExperience from '@/components/public/PublicHomeExperience'

type PublicHomeData = {
  slides: any[]
  newsArchive: any[]
  tournaments: any[]
  ads: any[]
  sponsors: any[]
  metrics?: {
    clubs: number
    players: number
    tournaments: number
    matches?: number | null
  }
  clubs: any[]
}

function getOpenRegistrationCount(tournaments: any[]) {
  return tournaments.filter((item) => {
    const status = String(item?.status ?? '').toUpperCase()
    return status.includes('INSCRIP') || status.includes('OPEN') || status.includes('REGISTRATION')
  }).length
}

export default function PublicHomeEmbed({ userName }: { userName?: string | null }) {
  const [data, setData] = useState<PublicHomeData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const response = await fetch('/api/public/home', { cache: 'no-store' })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json?.error ?? 'No pude cargar Comunidad SELPA.')
        if (alive) setData(json as PublicHomeData)
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : 'No pude cargar Comunidad SELPA.')
      }
    }

    void load()

    return () => {
      alive = false
    }
  }, [])

  if (error) return <div className="modeEmbedState">{error}</div>
  if (!data) {
    return (
      <div className="modeEmbedState modeEmbedState--loading">
        <SelpaLoader title="Cargando comunidad..." subtitle="Buscando torneos y clubes" />
      </div>
    )
  }
  const displayName = String(userName ?? '').trim()
  const openRegistrationCount = getOpenRegistrationCount(data.tournaments)
  const recentNewsCount = data.newsArchive.length
  const metrics = [
    typeof data.metrics?.clubs === 'number' ? { label: 'Clubes activos', value: data.metrics.clubs } : null,
    openRegistrationCount ? { label: 'Torneos con inscripción abierta', value: openRegistrationCount } : null,
    typeof data.metrics?.players === 'number' ? { label: 'Jugadores en la comunidad', value: data.metrics.players } : null,
    recentNewsCount ? { label: 'Noticias recientes', value: recentNewsCount } : null,
  ].filter((item): item is { label: string; value: number } => Boolean(item))

  return (
    <div className="modePublicHomeEmbed">
      <section className="modeCommunityHero">
        <span>Comunidad SELPA</span>
        <h1>Comunidad SELPA</h1>
        <p>{displayName ? `Hola ${displayName}, seguí explorando la comunidad.` : 'Hola, seguí explorando la comunidad.'}</p>
        {metrics.length ? (
          <div className="modeCommunityMetrics">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <strong>{new Intl.NumberFormat('es-AR').format(metric.value)}</strong>
                <small>{metric.label}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <PublicHomeExperience
        slides={data.slides}
        newsArchive={data.newsArchive}
        tournaments={data.tournaments}
        ads={data.ads}
        sponsors={data.sponsors}
        metrics={data.metrics}
        clubs={data.clubs}
        hideHero
        afterTournaments={<CommunityTournamentCalendar tournaments={data.tournaments} />}
      />
      <style>{`
        .modeCommunityHero {
          background:
            radial-gradient(circle at 12% 0%, rgba(34,211,238,.18), transparent 34%),
            linear-gradient(135deg, #07152f, #0b1734 52%, #17162f);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 20px;
          box-shadow: 0 16px 42px rgba(15,23,42,.14);
          color: #fff;
          display: grid;
          gap: 8px;
          margin: 0 auto 16px;
          max-width: 1180px;
          overflow: hidden;
          padding: 18px 20px;
          position: relative;
        }
        .modeCommunityHero::after {
          background: linear-gradient(90deg, #22d3ee, #ec4899);
          bottom: 0;
          content: "";
          height: 3px;
          left: 0;
          position: absolute;
          right: 0;
        }
        .modeCommunityHero > span {
          color: #67e8f9;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .modeCommunityHero h1 {
          font-size: clamp(28px, 4vw, 44px);
          font-weight: 950;
          letter-spacing: -.04em;
          line-height: .96;
          margin: 0;
        }
        .modeCommunityHero p {
          color: rgba(255,255,255,.74);
          font-size: 14px;
          font-weight: 800;
          margin: 0;
        }
        .modeCommunityMetrics {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }
        .modeCommunityMetrics div {
          background: rgba(255,255,255,.09);
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 14px;
          display: grid;
          gap: 2px;
          min-width: 132px;
          padding: 8px 10px;
        }
        .modeCommunityMetrics strong {
          color: #fff;
          font-size: 18px;
          font-weight: 950;
          line-height: 1;
        }
        .modeCommunityMetrics small {
          color: rgba(255,255,255,.68);
          font-size: 11px;
          font-weight: 850;
        }
        @media (max-width: 640px) {
          .modeCommunityHero {
            border-radius: 16px;
            gap: 5px;
            margin-bottom: 8px;
            padding: 10px 11px;
          }
          .modeCommunityHero::after {
            height: 2px;
          }
          .modeCommunityHero > span {
            font-size: 9px;
            font-weight: 850;
            letter-spacing: .04em;
          }
          .modeCommunityHero h1 {
            font-size: clamp(21px, 7.6vw, 28px);
            font-weight: 850;
            letter-spacing: -.02em;
            line-height: 1;
          }
          .modeCommunityHero p {
            font-size: 12px;
            font-weight: 650;
            line-height: 1.18;
          }
          .modeCommunityMetrics {
            display: grid;
            gap: 5px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-top: 2px;
          }
          .modeCommunityMetrics div {
            border-radius: 10px;
            gap: 1px;
            min-width: 0;
            padding: 5px 6px;
          }
          .modeCommunityMetrics strong {
            font-size: 14px;
            font-weight: 850;
          }
          .modeCommunityMetrics small {
            font-size: 9px;
            font-weight: 700;
            line-height: 1.1;
          }
        }
      `}</style>
    </div>
  )
}
