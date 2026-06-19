'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { resolveStorageUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'

type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'

type ClubData = {
  id: string
  name: string
  status: ClubStatus
  city: string | null
  province: string | null
  country: string | null
  address?: string | null
  phone?: string | null
  contact_email?: string | null
  website?: string | null
  instagram?: string | null
  courts_count?: number | null
  opening_hours?: string | null
  rules_pdf_url: string | null
  logo_url: string | null
  rejected_at: string | null
  rejection_reason: string | null
  correction_requested_at: string | null
  correction_reason: string | null
  suspended_at: string | null
  suspension_reason: string | null
}

type ClubSummary = {
  club: ClubData
  counts: {
    active_players: number
    pending_player_requests: number
    internal_staff: number
    active_or_upcoming_tournaments: number
  }
  tournaments: Array<{
    id: string
    name: string
    status: string | null
    date: string | null
    registration_deadline: string | null
  }>
}

const statusCopy: Record<ClubStatus, {
  label: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  title: string
  body: string
  ownerCan: string[]
  locked: string[]
}> = {
  PENDING_APPROVAL: {
    label: 'Pendiente de aprobación',
    tone: 'info',
    title: 'El club está en revisión',
    body: 'Podés completar datos y preparar la operación. La visibilidad pública y las funciones sensibles se habilitan al aprobarse.',
    ownerCan: ['Completar datos del club.', 'Cargar logo y reglamento.', 'Contactar al superadmin.'],
    locked: ['No aparece en listados públicos.', 'No acepta solicitudes públicas.', 'Las funciones públicas quedan pausadas.'],
  },
  ACTIVE: {
    label: 'Activo',
    tone: 'success',
    title: 'El club está activo',
    body: 'El club ya puede operar normalmente dentro de Pamprax.',
    ownerCan: ['Gestionar jugadores.', 'Administrar torneos.', 'Actualizar datos del club.'],
    locked: [],
  },
  REJECTED: {
    label: 'Rechazado',
    tone: 'danger',
    title: 'El alta fue rechazada',
    body: 'Revisá el motivo, corregí los datos necesarios y contactá a plataforma para continuar.',
    ownerCan: ['Corregir datos del club.', 'Actualizar documentación.', 'Pedir nueva revisión.'],
    locked: ['No aparece públicamente.', 'No acepta solicitudes de jugadores.', 'No opera funciones públicas.'],
  },
  SUSPENDED: {
    label: 'Suspendido',
    tone: 'warning',
    title: 'El club está suspendido',
    body: 'La operación pública queda detenida hasta que plataforma levante la suspensión.',
    ownerCan: ['Ver el motivo.', 'Mantener datos actualizados.', 'Contactar al superadmin.'],
    locked: ['No aparece públicamente.', 'No acepta nuevas solicitudes.', 'Funciones sensibles pausadas.'],
  },
}

function statusLabel(status?: ClubStatus | null) {
  if (!status) return 'Sin estado'
  return statusCopy[status]?.label ?? status
}

function getReviewReason(club: ClubData) {
  if (club.status === 'REJECTED') return club.rejection_reason
  if (club.status === 'SUSPENDED') return club.suspension_reason
  if (club.status === 'PENDING_APPROVAL') return club.correction_reason
  return null
}

function getReviewDate(club: ClubData) {
  if (club.status === 'REJECTED') return club.rejected_at
  if (club.status === 'SUSPENDED') return club.suspended_at
  if (club.status === 'PENDING_APPROVAL') return club.correction_requested_at
  return null
}

function formatDate(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function StatusPanel({ club }: { club: ClubData }) {
  const copy = statusCopy[club.status]
  const reason = getReviewReason(club)
  const reviewDate = formatDate(getReviewDate(club))

  return (
    <section className={`club-statusPanel club-statusPanel--${copy.tone}`}>
      <div className="club-statusPanelHead">
        <div className="club-minBlock">
          <span className="club-kicker">Estado del club</span>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
        </div>
        <span className="club-statusBadge">{copy.label}</span>
      </div>

      {reason ? (
        <div className="club-reviewReason">
          <b>{club.status === 'PENDING_APPROVAL' ? 'Corrección solicitada' : 'Motivo'}:</b> {reason}
          {reviewDate ? <span> · {reviewDate}</span> : null}
        </div>
      ) : null}

      <div className="club-statusLists">
        <div>
          <b>Qué podés hacer</b>
          <ul>{copy.ownerCan.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        {copy.locked.length ? (
          <div>
            <b>Todavía no habilitado</b>
            <ul>{copy.locked.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function MetricCard({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  )

  if (href) {
    return <Link href={href} className="club-metric">{content}</Link>
  }

  return <div className="club-metric">{content}</div>
}

export default function ClubPage() {
  const { role, activeClub } = useSession()
  const [summary, setSummary] = useState<ClubSummary | null>(null)
  const [clubForPlayer, setClubForPlayer] = useState<ClubData | null>(null)
  const [themeKey, setThemeKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const theme = useMemo(() => getClubTheme(themeKey), [themeKey])
  const themeStyle = useMemo(
    () => ({
      '--club-admin-accent': theme.vars.accent,
      '--club-admin-accent-2': theme.vars.accent2,
      '--club-admin-soft': theme.vars.soft,
      '--club-admin-glow': theme.vars.glow,
    }) as CSSProperties,
    [theme]
  )

  useEffect(() => {
    let alive = true

    ;(async () => {
      if (!activeClub?.id) {
        setThemeKey(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) {
        if (alive) {
          setError('Sesión expirada.')
          setLoading(false)
        }
        return
      }

      const endpoint = role === 'player'
        ? `/api/clubs/${activeClub.id}`
        : `/api/clubs/${activeClub.id}/summary`

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const [json, clubThemeResult] = await Promise.all([
        response.json().catch(() => ({})),
        supabase.from('clubs').select('theme_key').eq('id', activeClub.id).maybeSingle(),
      ])

      if (!alive) return

      if (!response.ok) {
        setError(json?.error ?? 'No pude cargar el club.')
        setLoading(false)
        return
      }

      if (role === 'player') {
        const data = json?.club as ClubData | undefined
        if (data?.logo_url) data.logo_url = await resolveStorageUrl(data.logo_url)
        if (!alive) return
        setClubForPlayer(data ?? null)
        setSummary(null)
      } else {
        setSummary(json as ClubSummary)
        setClubForPlayer(null)
      }
      setThemeKey((clubThemeResult.data?.theme_key as string | null) ?? null)

      setLoading(false)
    })()

    return () => {
      alive = false
    }
  }, [activeClub?.id, role])

  if (loading) return <div className="px-wrap"><div className="px-help">Cargando club...</div></div>
  if (error) return <div className="px-wrap"><div className="px-help">{error}</div></div>

  if (role === 'player') {
    if (!clubForPlayer) return <div className="px-wrap"><div className="px-help">No hay club activo seleccionado.</div></div>

    return (
      <div className="px-wrap">
        <div className="club-panel">
          <h1 className="club-title">Ver club</h1>
          <p className="club-sub">{clubForPlayer.name} · {[clubForPlayer.city, clubForPlayer.province].filter(Boolean).join(' · ')}</p>
          <div className="px-pill" style={{ width: 'fit-content', marginTop: 10 }}>Estado: {statusLabel(clubForPlayer.status)}</div>
          <div className="club-publicGrid">
            <div className="px-card px-card--flat club-logoBox">
              {clubForPlayer.logo_url ? <img src={clubForPlayer.logo_url} alt={clubForPlayer.name} /> : <span className="px-help">Sin logo</span>}
            </div>
            <div className="px-card px-card--flat club-publicInfo">
              <div><b>Ubicación:</b> {[clubForPlayer.city, clubForPlayer.province, clubForPlayer.country].filter(Boolean).join(' · ') || 'Sin datos'}</div>
              <div><b>Dirección:</b> {clubForPlayer.address || 'Sin datos'}</div>
              <div><b>Teléfono:</b> {clubForPlayer.phone || 'Sin datos'}</div>
              <div><b>Email:</b> {clubForPlayer.contact_email || 'Sin datos'}</div>
              <div><b>Reglamento:</b> {clubForPlayer.rules_pdf_url ? <a className="px-link" href={clubForPlayer.rules_pdf_url} target="_blank" rel="noreferrer">Abrir PDF</a> : 'No cargado'}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!summary?.club) {
    return <div className="px-wrap"><div className="px-help">No hay club activo seleccionado.</div></div>
  }

  const club = summary.club
  const isActive = club.status === 'ACTIVE'

  return (
    <div className="px-wrap">
      <div className="club-panel club-dashboard" style={themeStyle}>
        <div className="club-dashboardHead">
          <div>
            <span className="club-kicker">Resumen operativo</span>
            <h1 className="club-title">Dashboard del club</h1>
            <p className="club-sub">{club.name} · {[club.city, club.province].filter(Boolean).join(' · ') || 'Sin ubicación cargada'}</p>
          </div>
          <span className={`club-mainBadge club-mainBadge--${statusCopy[club.status].tone}`}>{statusLabel(club.status)}</span>
        </div>

        <StatusPanel club={club} />

        <section className="club-metricsGrid" aria-label="Resumen operativo">
          <MetricCard label="Jugadores activos" value={summary.counts.active_players} href="/club/jugadores" />
          <MetricCard label="Solicitudes pendientes" value={summary.counts.pending_player_requests} href="/club/jugadores" />
          <MetricCard label="Staff interno" value={summary.counts.internal_staff} href="/club/usuarios" />
          <MetricCard label="Torneos activos o próximos" value={summary.counts.active_or_upcoming_tournaments} href="/club/torneos" />
        </section>

        <section className="club-dashboardGrid">
          <div className="club-card">
            <div className="club-cardHead">
              <div>
                <span className="club-kicker">Operación</span>
                <h2>Torneos activos o próximos</h2>
              </div>
              <Link href="/club/torneos" className="club-cardLink">Ver torneos</Link>
            </div>

            {summary.tournaments.length ? (
              <div className="club-list">
                {summary.tournaments.map((tournament) => (
                  <div key={tournament.id} className="club-listRow">
                    <div className="club-listMain">
                      <strong>{tournament.name}</strong>
                      <span>{tournament.date ? formatDate(tournament.date) : 'Sin fecha'} · {tournament.status ?? 'Sin estado'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-empty">Todavía no hay torneos activos o próximos.</div>
            )}
          </div>

          <div className="club-card">
            <div className="club-cardHead">
              <div>
                <span className="club-kicker">Accesos rápidos</span>
                <h2>{isActive ? 'Gestionar club' : 'Preparar aprobación'}</h2>
              </div>
            </div>
            <div className="club-actionsGrid">
              <Link href="/club/jugadores" className="club-action">Jugadores y solicitudes</Link>
              <Link href="/club/configuracion" className="club-action">Configuración del club</Link>
              <Link href="/club/torneos" className={`club-action ${!isActive ? 'is-muted' : ''}`}>Torneos</Link>
              <Link href="/club/mensajes" className="club-action">Contactar superadmin</Link>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .club-dashboard {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 24px;
          box-shadow: 0 24px 64px rgba(15,23,42,.09);
          min-width: 0;
          overflow: hidden;
          padding: 22px;
          position: relative;
        }
        .club-dashboard::before {
          background: linear-gradient(90deg, var(--club-admin-accent), var(--club-admin-accent-2));
          content: "";
          height: 4px;
          left: 0;
          position: absolute;
          right: 0;
          top: 0;
        }
        .club-dashboardHead {
          align-items: flex-start;
          background: linear-gradient(135deg, rgba(248,250,252,.98), var(--club-admin-soft));
          border: 1px solid rgba(15,23,42,.07);
          border-radius: 20px;
          display: flex;
          gap: 14px;
          justify-content: space-between;
          padding: 18px;
        }
        .club-mainBadge, .club-statusBadge {
          border: 1px solid rgba(15, 23, 42, 0.10);
          border-radius: 999px;
          color: #17253f;
          font-size: 13px;
          font-weight: 900;
          padding: 8px 10px;
          white-space: nowrap;
        }
        .club-mainBadge {
          background: #061b3a;
          border-color: color-mix(in srgb, var(--club-admin-accent) 34%, transparent);
          box-shadow: 0 12px 28px var(--club-admin-glow);
          color: #fff;
        }
        .club-mainBadge--success,
        .club-mainBadge--info,
        .club-mainBadge--warning,
        .club-mainBadge--danger { background: #061b3a; }
        .club-statusPanel {
          border: 1px solid rgba(15, 23, 42, 0.10);
          border-radius: 18px;
          display: grid;
          gap: 12px;
          margin-top: 16px;
          padding: 14px;
        }
        .club-statusPanel--info,
        .club-statusPanel--success {
          background: linear-gradient(135deg, rgba(255,255,255,.96), var(--club-admin-soft));
          border-color: color-mix(in srgb, var(--club-admin-accent) 20%, transparent);
        }
        .club-statusPanel--warning { background: rgba(255, 251, 235, 0.88); border-color: rgba(217, 119, 6, 0.22); }
        .club-statusPanel--danger { background: rgba(254, 242, 242, 0.88); border-color: rgba(220, 38, 38, 0.20); }
        .club-statusPanelHead { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; }
        .club-minBlock { display: grid; gap: 5px; min-width: 0; }
        .club-minBlock strong { color: #17253f; font-size: 18px; font-weight: 950; line-height: 1.15; }
        .club-minBlock p { color: #334155; line-height: 1.4; margin: 0; }
        .club-kicker { color: var(--club-admin-accent); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
        .club-reviewReason { background: rgba(255,255,255,.72); border: 1px solid rgba(15,23,42,.08); border-radius: 12px; color: #17253f; line-height: 1.4; padding: 10px; }
        .club-statusLists { display: grid; gap: 10px; }
        .club-statusLists b { color: #17253f; }
        .club-statusLists ul { color: #334155; display: grid; gap: 4px; margin: 6px 0 0; padding-left: 18px; }
        .club-metricsGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
        .club-metric {
          background: #fff;
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 16px;
          color: #17253f;
          display: grid;
          gap: 4px;
          min-width: 0;
          padding: 14px;
          text-decoration: none;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .club-metric:hover {
          border-color: color-mix(in srgb, var(--club-admin-accent) 28%, transparent);
          box-shadow: 0 14px 34px var(--club-admin-glow);
          transform: translateY(-1px);
        }
        .club-metric span { color: #64748b; font-size: 12px; font-weight: 800; }
        .club-metric strong { font-size: 26px; font-weight: 950; line-height: 1; }
        .club-dashboardGrid { display: grid; gap: 14px; margin-top: 14px; }
        .club-card {
          background: rgba(255,255,255,.96);
          border: 1px solid rgba(15,23,42,.08);
          border-radius: 20px;
          box-shadow: 0 16px 42px rgba(15,23,42,.055);
          display: grid;
          gap: 12px;
          min-width: 0;
          padding: 16px;
        }
        .club-cardHead { align-items: flex-start; display: flex; gap: 10px; justify-content: space-between; }
        .club-cardHead h2 { color: #17253f; font-size: 18px; line-height: 1.15; margin: 2px 0 0; }
        .club-cardLink {
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 26%, transparent);
          border-radius: 999px;
          color: #061b3a;
          font-size: 12px;
          font-weight: 950;
          min-height: 34px;
          padding: 8px 12px;
          text-decoration: none;
          white-space: nowrap;
        }
        .club-list { display: grid; gap: 8px; min-width: 0; }
        .club-listRow { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 14px; padding: 10px; min-width: 0; }
        .club-listMain { display: grid; gap: 3px; min-width: 0; }
        .club-listMain strong { color: #17253f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-listMain span { color: #64748b; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .club-actionsGrid { display: grid; gap: 8px; grid-template-columns: 1fr; }
        .club-action {
          align-items: center;
          background: #fff;
          border: 1px solid color-mix(in srgb, var(--club-admin-accent) 28%, transparent);
          border-radius: 999px;
          color: #061b3a;
          display: inline-flex;
          font-weight: 950;
          justify-content: center;
          min-height: 42px;
          padding: 10px 13px;
          text-decoration: none;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .club-action:hover {
          border-color: color-mix(in srgb, var(--club-admin-accent) 46%, transparent);
          box-shadow: 0 14px 30px var(--club-admin-glow);
          transform: translateY(-1px);
        }
        .club-action.is-muted { opacity: .62; }
        .club-publicGrid { display: grid; gap: 14px; margin-top: 16px; }
        .club-logoBox { align-items: center; display: flex; justify-content: center; min-height: 150px; }
        .club-logoBox img { max-height: 110px; max-width: 100%; object-fit: contain; }
        .club-publicInfo { display: grid; gap: 8px; min-width: 0; }
        @media (min-width: 760px) {
          .club-statusPanel { padding: 16px; }
          .club-statusLists { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-metricsGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .club-dashboardGrid { grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr); }
          .club-actionsGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .club-publicGrid { grid-template-columns: 220px minmax(0, 1fr); }
        }
        @media (max-width: 620px) {
          .club-dashboardHead, .club-statusPanelHead, .club-cardHead { display: grid; }
          .club-metricsGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
