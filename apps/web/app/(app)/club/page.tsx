'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import { resolveStorageUrl } from '@/lib/clubAssets'
import { getClubTheme } from '@/lib/clubThemes'
import { BRAND } from '@/lib/branding'
import { canUpdateTournament } from '@/lib/clubPermissions'

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
    body: `El club ya puede operar normalmente dentro de ${BRAND.name}.`,
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

export default function ClubPage() {
  const { role, activeClub, user, clubRole } = useSession()
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

  if (loading) {
    return (
      <div className="px-wrap">
        <div className="club-panel club-dashboard" aria-busy="true" aria-label="Cargando resumen del club">
          <div className="club-dashboardHead">
            <div>
              <span className="club-kicker">Resumen operativo</span>
              <h1 className="club-title">Dashboard del club</h1>
              <p className="club-sub">{activeClub?.name ?? 'Club activo'}</p>
            </div>
          </div>
          <section className="club-metricsGrid club-skeletonGrid" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => <span className="club-skeletonCard" key={item} />)}
          </section>
          <style jsx>{`
            .club-skeletonGrid { display:grid; gap:10px; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:14px }
            .club-skeletonCard { animation:clubSkeleton 1.2s ease-in-out infinite alternate; background:#e8edf2; border-radius:16px; min-height:76px }
            @keyframes clubSkeleton { to { opacity:.48 } }
            @media (min-width:760px) { .club-skeletonGrid { grid-template-columns:repeat(4,minmax(0,1fr)) } }
            @media (prefers-reduced-motion:reduce) { .club-skeletonCard { animation:none } }
          `}</style>
        </div>
      </div>
    )
  }
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
    return <div className="px-wrap"><div className="px-help">No pudimos cargar la información del club. Actualizá la página para volver a intentar.</div></div>
  }

  const club = summary.club
  const isActive = club.status === 'ACTIVE'
  const greeting = user?.name?.trim() ? `Hola, ${user.name.trim().split(/\s+/)[0]} 👋` : 'Todo listo para hoy'
  const priorities = [
    ...(summary.tournaments.slice(0, 2).filter((tournament) => tournament.registration_deadline).map((tournament) => ({ href: '/club/torneos', title: tournament.name, detail: `Inscripciones cierran ${formatDate(tournament.registration_deadline!)}`, badge: 'URGENTE', tone: 'urgent' }))),
    ...(summary.counts.pending_player_requests > 0 ? [{ href: '/club/solicitudes', title: `${summary.counts.pending_player_requests} solicitud${summary.counts.pending_player_requests === 1 ? '' : 'es'} pendiente${summary.counts.pending_player_requests === 1 ? '' : 's'}`, detail: 'Revisalas para mantener el padrón actualizado.', badge: 'PENDIENTE', tone: 'pending' }] : []),
    ...(summary.counts.active_or_upcoming_tournaments > 0 ? [{ href: '/club/torneos', title: 'Torneos próximos', detail: 'Revisá sede, cupos y organización.', badge: 'PRÓXIMO', tone: 'upcoming' }] : []),
  ].slice(0, 3)
  const recommendedTournament = summary.tournaments[0]
  // La membresía aprobada/capacidad canónica del club activo decide el destino.
  // La API administrativa vuelve a validar el permiso al cargar el detalle.
  const canManageAgendaTournament = canUpdateTournament(clubRole)

  return (
    <div className="px-wrap">
      <div className="club-panel club-dashboard" style={themeStyle}>
        <div className="club-dashboardHead">
          <div>
            <span className="club-kicker">Centro operativo</span>
            <h1 className="club-greeting">{greeting}</h1>
            <p className="club-sub">{isActive ? '✓ Todo listo para hoy.' : 'Hay acciones pendientes para dejar el club listo.'}</p>
          </div>
          <span className={`club-mainBadge club-mainBadge--${statusCopy[club.status].tone}`}>{statusLabel(club.status)}</span>
          <div className="club-heroMetrics" aria-label="Estado del club">
            <Link href="/club/jugadores"><strong>{summary.counts.active_players}</strong><span>Jugadores</span></Link>
            <Link href="/club/torneos"><strong>{summary.counts.active_or_upcoming_tournaments}</strong><span>Torneos activos</span></Link>
            <Link href="/club/solicitudes"><strong>{summary.counts.pending_player_requests}</strong><span>Solicitudes</span></Link>
          </div>
        </div>

        {!isActive ? <StatusPanel club={club} /> : null}

        <section className="club-priorityStrip" aria-label="Prioridades de hoy">
          <div><span className="club-kicker">Prioridades</span><h2>Lo que necesita atención hoy</h2></div>
          <div className="club-priorityList">{priorities.length ? priorities.map((priority) => <Link href={priority.href} key={`${priority.tone}-${priority.title}`}><span className="club-priorityCopy"><b>{priority.title}</b><small>{priority.detail}</small></span><em className={`club-priorityBadge club-priorityBadge--${priority.tone}`}>{priority.badge}</em><i>›</i></Link>) : <div className="club-priorityClear"><b>✓ Todo está al día.</b><span>No hay acciones pendientes.</span></div>}</div>
        </section>

        <section className="club-dashboardGrid">
          <div className="club-card">
            <div className="club-cardHead"><div><span className="club-kicker">Acciones principales</span><h2>{isActive ? '¿Qué querés hacer?' : 'Preparar aprobación'}</h2></div></div>
            <div className="club-actionsGrid">
              <Link href="/club/torneos/nuevo" className={`club-action ${!isActive ? 'is-muted' : ''}`}><b>🏆</b><span><strong>Crear torneo</strong><small>Organizá una competencia independiente.</small></span><i>›</i></Link>
              <Link href="/club/competition/series/new" className={`club-action ${!isActive ? 'is-muted' : ''}`}><b>🏅</b><span><strong>Crear circuito</strong><small>Administrá varias fechas con ranking.</small></span><i>›</i></Link>
              <Link href="/club/torneos/calendario" className="club-action"><b>◷</b><span><strong>Ver agenda</strong><small>Consultá las próximas fechas del club.</small></span><i>›</i></Link>
              <Link href="/club/jugadores" className="club-action"><b>◉</b><span><strong>Gestionar jugadores</strong><small>Revisá el padrón y solicitudes.</small></span><i>›</i></Link>
            </div>
          </div>
          <section className="club-card club-agendaCard">
            <div className="club-cardHead">
              <div>
                <span className="club-kicker">Agenda</span>
                <h2>Próximas competencias</h2>
              </div>
              <Link href="/club/torneos" className="club-cardLink">Ver todas →</Link>
            </div>

            {summary.tournaments.length ? (
              <div className="club-list">
                {summary.tournaments.map((tournament) => (
                  <Link key={tournament.id} href={canManageAgendaTournament ? `/club/torneos/${tournament.id}` : `/torneos/${tournament.id}`} className="club-listRow club-agendaRow">
                    <div className="club-agendaDate">
                      <span className="club-agendaMonth">{tournament.date ? new Date(tournament.date).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase() : 'FECHA'}</span>
                      <b>{tournament.date ? new Date(tournament.date).getDate() : '—'}</b>
                    </div><div className="club-listMain">
                      <strong>{tournament.name}</strong>
                      <span>Torneo · {tournament.status ?? 'Sin estado'}</span>
                    </div><span className="club-agendaCta">{canManageAgendaTournament ? 'Gestionar →' : 'Entrar →'}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-empty">Todavía no hay torneos activos o próximos.</div>
            )}
          </section>

        </section>
        <section className="club-recommendation"><div className="club-assistantLead"><span className="club-kicker">SELPA recomienda</span><strong>{recommendedTournament ? 'Hoy te recomiendo...' : 'No te olvides de...'}</strong></div><p>{recommendedTournament ? <>Revisá la organización de <b>{recommendedTournament.name}</b> antes de la próxima jornada.</> : 'Prepará la próxima competencia para mantener la actividad del club en movimiento.'}</p><Link href={recommendedTournament ? '/club/torneos' : '/club/competition'}>Revisar →</Link></section>
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
          display: grid;
          gap: 14px;
          grid-template-columns: minmax(0, 1fr) auto;
          justify-content: space-between;
          padding: 16px;
        }
        .club-greeting { color:#17253f; font-size:18px; font-weight:900; line-height:1.2; margin:4px 0 0; }.club-dashboardHead .club-sub { margin:3px 0 0; max-width:46ch; }
        .club-heroMetrics { border-top:1px solid rgba(15,23,42,.08); display:grid; gap:0; grid-column:1 / -1; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:0; padding-top:10px; }.club-heroMetrics a { color:#52657a; display:grid; gap:1px; min-width:0; padding:0 8px; text-decoration:none; }.club-heroMetrics a+a { border-left:1px solid rgba(15,23,42,.08); }.club-heroMetrics strong { color:#071b3a; font-size:24px; line-height:1; }.club-heroMetrics span { font-size:10px; font-weight:800; line-height:1.2; }
        .club-priorityStrip { align-items:center; background:#071b39; border-radius:18px; color:#fff; display:grid; gap:10px; grid-template-columns:minmax(0,1fr); margin-top:12px; padding:12px 14px; }
        .club-priorityStrip .club-kicker { color:#bde97c; }.club-priorityStrip h2 { font-size:17px; line-height:1.15; margin:3px 0 0; }
        .club-priorityList { display:grid; gap:0; }.club-priorityList a,.club-priorityClear { align-items:center; color:#fff; display:grid; gap:8px; grid-template-columns:minmax(0,1fr) auto auto; min-height:39px; padding:5px 0; text-decoration:none; }.club-priorityList a+a { border-top:1px solid rgba(255,255,255,.14); }.club-priorityCopy { display:grid; gap:1px; min-width:0; }.club-priorityList b { color:#fff; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.club-priorityList small,.club-priorityClear span { color:rgba(255,255,255,.72); font-size:10px; font-weight:700; line-height:1.15; }.club-priorityBadge { border:1px solid transparent; border-radius:999px; font-size:9px; font-style:normal; font-weight:950; letter-spacing:.04em; padding:3px 6px; }.club-priorityBadge--urgent { background:rgba(255,219,135,.16); border-color:rgba(255,219,135,.34); color:#ffe0a1; }.club-priorityBadge--pending { background:rgba(190,233,124,.13); border-color:rgba(190,233,124,.30); color:#d6f2a2; }.club-priorityBadge--upcoming { background:rgba(143,211,255,.12); border-color:rgba(143,211,255,.30); color:#b9e8ff; }.club-priorityList i { color:#d6f2a2; font-size:18px; font-style:normal; }.club-priorityClear { grid-template-columns:1fr; }
        .club-agendaCard { color:inherit; transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease; }.club-agendaCard:hover { border-color:color-mix(in srgb,var(--club-admin-accent) 30%,transparent); box-shadow:0 18px 44px var(--club-admin-glow); transform:translateY(-1px); }.club-agendaRow { align-items:center; border-left:2px solid var(--club-admin-accent); color:inherit; display:grid; gap:10px; grid-template-columns:auto minmax(0,1fr) auto; padding-left:8px; text-decoration:none; }.club-agendaRow:hover .club-agendaCta { text-decoration:underline; }.club-agendaCta { align-self:end; color:var(--club-admin-accent); font-size:11px; font-weight:900; justify-self:end; padding-bottom:2px; white-space:nowrap; }.club-agendaDate { background:#fff; border:1px solid rgba(15,23,42,.12); border-radius:10px; display:grid; justify-items:center; min-width:46px; overflow:hidden; position:relative; }.club-agendaMonth { background:var(--club-admin-soft); color:#36506e; font-size:9px; font-weight:950; letter-spacing:.06em; line-height:1; padding:5px 4px; text-align:center; width:100%; }.club-agendaDate b { color:#071b3a; font-size:21px; line-height:1; padding:6px 4px 7px; }.club-agendaDate .club-agendaRelative { background:var(--club-admin-accent); border-radius:999px; color:#fff; font-size:8px; font-weight:950; padding:3px 5px; position:absolute; right:-4px; top:-5px; }.club-recommendation { align-items:center; background:transparent; border:0; border-left:3px solid var(--club-admin-accent); border-radius:0; display:grid; gap:4px 12px; grid-template-columns:minmax(0,1fr) auto; margin-top:12px; padding:8px 0 8px 12px; }.club-assistantLead { display:grid; gap:2px; }.club-assistantLead .club-kicker { font-size:9px; }.club-recommendation strong { color:#102544; font-size:14px; }.club-recommendation p { color:#607089; font-size:12px; grid-column:1 / -1; line-height:1.35; margin:0; }.club-recommendation p b { color:#334b68; }.club-recommendation a { align-self:center; color:var(--club-admin-accent); font-size:12px; font-weight:900; text-decoration:none; white-space:nowrap; }
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
        .club-dashboardHead .club-mainBadge {
          align-self: start;
          box-shadow: none;
          font-size: 10px;
          letter-spacing: .03em;
          padding: 4px 7px;
        }
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
          padding: 14px;
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
          display: grid;
          font-weight: 950;
          gap: 9px;
          grid-template-columns: auto minmax(0,1fr) auto;
          justify-content: start;
          min-height: 58px;
          padding: 8px 10px;
          text-decoration: none;
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .club-action:hover, .club-action:focus-visible {
          border-color: color-mix(in srgb, var(--club-admin-accent) 46%, transparent);
          box-shadow: 0 14px 30px var(--club-admin-glow);
          transform: translateY(-1px);
        }
        .club-action.is-muted { opacity: .62; }
        .club-action:active { transform:translateY(0) scale(.985); }.club-action > b { align-items:center; background:var(--club-admin-soft); border-radius:10px; display:grid; font-size:18px; height:38px; justify-content:center; width:38px; }.club-action > span { display:grid; gap:2px; min-width:0; }.club-action > span strong { font-size:13px; }.club-action > span small { color:#64748b; font-size:10px; font-weight:750; line-height:1.15; }.club-action > i { color:var(--club-admin-accent); font-size:25px; font-style:normal; font-weight:800; line-height:1; }
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
          .club-dashboard { padding:12px; }
          .club-dashboardHead { align-items:center; border-radius:14px; padding:12px; }
          .club-dashboardHead .club-sub { margin-top:2px; }
          .club-dashboardHead, .club-statusPanelHead, .club-cardHead { display: grid; }
          .club-statusPanel--success { display:none; }
          .club-metricsGrid { gap:8px; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:10px; }
          .club-metric { border-radius:13px; padding:10px; }
          .club-metric strong { font-size:22px; }
          .club-dashboardGrid { gap:10px; margin-top:10px; }
          .club-card { border-radius:14px; gap:10px; padding:12px; }
        }
      `}</style>
    </div>
  )
}
