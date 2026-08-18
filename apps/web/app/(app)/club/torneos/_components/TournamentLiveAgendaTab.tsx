'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type LiveAgendaMatch = {
  id: string
  team1_name?: string | null
  team2_name?: string | null
  phase?: string | null
  status?: string | null
  scheduled_at?: string | null
  court_name?: string | null
  isScheduled: boolean
  isLate: boolean
  isProbablyInProgress: boolean
  isPlayed: boolean
  minutesLate: number
}

type LiveAgendaCourt = {
  key: string
  courtName: string | null
  matches: LiveAgendaMatch[]
}

type LiveAgendaResponse = {
  courts: LiveAgendaCourt[]
  timeline: LiveAgendaMatch[]
  metrics: {
    pendingMatches: number
    lateMatches: number
    probablyInProgressMatches: number
  }
}

type Props = {
  clubId?: string | null
  tournamentId?: string | null
  tournamentStatus?: string | null
  registrationsCount?: number
  hasGroups?: boolean
  onPublish?: () => void
  onOpenGroups?: () => void
}

function formatTime(value?: string | null) {
  if (!value) return 'Sin hora'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin hora'
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatPhase(value?: string | null) {
  const cleanValue = String(value ?? '').trim().toUpperCase()
  const labels: Record<string, string> = {
    GROUP: 'Grupo',
    ROUND_OF_32: '32avos',
    ROUND_OF_16: '16avos',
    EIGHTHS: 'Octavos',
    QUARTER: 'Cuartos',
    SEMI: 'Semi',
    FINAL: 'Final',
    THIRD_PLACE: '3° puesto',
  }
  return labels[cleanValue] ?? (cleanValue ? cleanValue.replaceAll('_', ' ') : 'Partido')
}

function getDerivedStatus(match: LiveAgendaMatch) {
  if (match.isPlayed) return { label: 'Jugado', tone: 'played' }
  if (String(match.status ?? '').toUpperCase() === 'CANCELLED') return { label: 'Cancelado', tone: 'cancelled' }
  if (match.isLate) return { label: `Atrasado ${match.minutesLate}m`, tone: 'late' }
  if (match.isProbablyInProgress) return { label: 'En curso', tone: 'live' }
  if (match.isScheduled) return { label: 'Programado', tone: 'scheduled' }
  return { label: 'Sin horario', tone: 'empty' }
}

function LiveMatchRow({ match, compactCourt }: { match: LiveAgendaMatch; compactCourt?: boolean }) {
  const status = getDerivedStatus(match)
  return (
    <article className="live-matchRow">
      <div className="live-matchMeta">
        <strong>{formatTime(match.scheduled_at)}</strong>
        <span>{formatPhase(match.phase)}</span>
        {compactCourt ? <small>{match.court_name ?? 'Sin cancha'}</small> : null}
      </div>
      <div className="live-matchTeams" title={`${match.team1_name ?? 'Equipo 1'} vs ${match.team2_name ?? 'Equipo 2'}`}>
        <strong>{match.team1_name ?? 'Equipo 1'}</strong>
        <span>vs</span>
        <strong>{match.team2_name ?? 'Equipo 2'}</strong>
      </div>
      <span className={`live-status live-status--${status.tone}`}>{status.label}</span>
    </article>
  )
}

export function TournamentLiveAgendaTab({ clubId, tournamentId, tournamentStatus, registrationsCount = 0, hasGroups = false, onPublish, onOpenGroups }: Props) {
  const [agenda, setAgenda] = useState<LiveAgendaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'live' | 'played'>('all')

  useEffect(() => {
    let cancelled = false

    async function loadAgenda() {
      if (!clubId || !tournamentId) {
        setAgenda(null)
        return
      }

      setLoading(true)
      setError('')

      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) {
        if (!cancelled) {
          setAgenda(null)
          setError('Sesión inválida.')
          setLoading(false)
        }
        return
      }

      const res = await fetch(`/api/clubs/${clubId}/tournaments/${tournamentId}/live-agenda`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))

      if (cancelled) return
      if (!res.ok) {
        setAgenda(null)
        setError(typeof json?.error === 'string' ? json.error : 'No pude cargar la agenda.')
        setLoading(false)
        return
      }

      setAgenda(json as LiveAgendaResponse)
      setLoading(false)
    }

    loadAgenda()

    return () => {
      cancelled = true
    }
  }, [clubId, tournamentId])

  const timeline = useMemo(() => agenda?.timeline ?? [], [agenda])
  const filteredTimeline = useMemo(() => timeline.filter((match) => {
    if (filter === 'pending') return !match.isPlayed && !match.isProbablyInProgress
    if (filter === 'live') return match.isProbablyInProgress
    if (filter === 'played') return match.isPlayed
    return true
  }), [filter, timeline])
  const matchesByDay = useMemo(() => filteredTimeline.reduce<Record<string, LiveAgendaMatch[]>>((groups, match) => {
    const key = match.scheduled_at ? new Date(match.scheduled_at).toISOString().slice(0, 10) : 'Sin fecha'
    groups[key] = [...(groups[key] ?? []), match]
    return groups
  }, {}), [filteredTimeline])
  const conflicts = useMemo(() => {
    const slots = new Map<string, number>()
    timeline.filter((match) => match.scheduled_at && match.court_name).forEach((match) => {
      const key = `${match.court_name}|${match.scheduled_at}`
      slots.set(key, (slots.get(key) ?? 0) + 1)
    })
    return [...slots.entries()].filter(([, count]) => count > 1)
  }, [timeline])
  const isDraft = String(tournamentStatus ?? '').toUpperCase() === 'DRAFT'

  if (loading && !agenda) {
    return <div className="live-empty">Cargando agenda del torneo...</div>
  }

  if (error) {
    return <div className="live-empty live-empty--warning">{error}</div>
  }

  return (
    <section className="live-agenda">
      <div className="live-metrics" aria-label="Resumen de agenda">
        <div className="live-metric">
          <span>Pendientes</span>
          <strong>{agenda?.metrics.pendingMatches ?? 0}</strong>
        </div>
        <div className={`live-metric ${(agenda?.metrics.probablyInProgressMatches ?? 0) > 0 ? 'live-metric--live' : ''}`}>
          <span>En curso</span>
          <strong>{agenda?.metrics.probablyInProgressMatches ?? 0}</strong>
        </div>
        <div className={`live-metric ${(agenda?.metrics.lateMatches ?? 0) > 0 ? 'live-metric--late' : ''}`}>
          <span>Atrasados</span>
          <strong>{agenda?.metrics.lateMatches ?? 0}</strong>
        </div>
      </div>

      {timeline.length === 0 ? (
        <section className="live-empty live-empty--context">
          <strong>Todavía no hay partidos en la agenda</strong>
          <span>{isDraft ? 'Primero publicá el torneo y completá las inscripciones. Después SELPA podrá organizar los partidos.' : registrationsCount > 0 && !hasGroups ? 'Las parejas están listas. Generá los grupos para crear los primeros partidos.' : 'Cuando se generen los grupos, vas a ver los partidos organizados por día y cancha.'}</span>
          {isDraft && onPublish ? <button type="button" onClick={onPublish}>Publicar torneo</button> : null}
          {!isDraft && registrationsCount > 0 && !hasGroups && onOpenGroups ? <button type="button" onClick={onOpenGroups}>Ir a Grupos</button> : null}
        </section>
      ) : (
        <section className="live-agendaList">
          {conflicts.length > 0 ? <div className="live-conflicts"><strong>⚠ {conflicts.length} conflicto{conflicts.length === 1 ? '' : 's'} de programación</strong><span>{conflicts[0][0].replace('|', ' · ')}</span></div> : null}
          <header className="live-agendaHead"><div><span>Agenda</span><strong>{timeline.length} partido{timeline.length === 1 ? '' : 's'}</strong></div><div className="live-filters">{([['all', 'Todos'], ['pending', 'Pendientes'], ['live', 'En curso'], ['played', 'Finalizados']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></header>
          {Object.entries(matchesByDay).map(([day, matches]) => <div key={day} className="live-day"><strong>{day === 'Sin fecha' ? day : new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`))}</strong><div className="live-timeline">{matches.map((match) => <LiveMatchRow key={match.id} match={match} compactCourt />)}</div></div>)}
        </section>
      )}

      <style jsx>{`
        .live-agenda { display: grid; gap: 12px; min-width: 0; }
        .live-metrics { background:#fff; border:1px solid rgba(15,23,42,.08); border-radius:12px; display:grid; gap:0; grid-template-columns:repeat(3,minmax(0,1fr)); overflow:hidden; }
        .live-metric { border-right:1px solid rgba(15,23,42,.07); display:grid; gap:3px; min-width:0; padding:10px 11px; }
        .live-metric:last-child { border-right:0; }
        .live-metric span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .live-metric strong { color: #17253f; font-size: 24px; font-weight: 950; line-height: 1; }
        .live-metric--late { background:#fff7ed; }
        .live-metric--live { background:#ecfdf3; }
        .live-sectionHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .live-sectionHead span { color: #17253f; font-size: 15px; font-weight: 950; }
        .live-sectionHead strong { color: #64748b; font-size: 12px; font-weight: 900; white-space: nowrap; }
        .live-matchList, .live-timeline { display: grid; gap: 7px; min-width: 0; }
        .live-matchRow { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.07); border-radius: 10px; display: grid; gap: 8px; grid-template-columns: 76px minmax(0, 1fr) auto; min-width: 0; padding: 8px; }
        .live-matchMeta { display: grid; gap: 2px; min-width: 0; }
        .live-matchMeta strong { color: #0f8ea0; font-size: 13px; font-weight: 950; }
        .live-matchMeta span, .live-matchMeta small { color: #64748b; font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-matchTeams { align-items: center; display: grid; gap: 2px; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); min-width: 0; }
        .live-matchTeams strong { color: #17253f; font-size: 12px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-matchTeams span { color: #94a3b8; font-size: 10px; font-weight: 950; text-transform: uppercase; }
        .live-status { border-radius: 999px; font-size: 11px; font-weight: 950; padding: 5px 8px; text-align: center; white-space: nowrap; }
        .live-status--scheduled { background: #e9fbff; color: #0f8ea0; }
        .live-status--live { background: #dcfce7; color: #166534; }
        .live-status--late { background: #ffedd5; color: #9a3412; }
        .live-status--played { background: #eef2ff; color: #3730a3; }
        .live-status--cancelled { background: #ffe4e6; color: #9f1239; }
        .live-status--empty { background: #f1f5f9; color: #64748b; }
        .live-empty { background:#f8fafc; border:1px dashed rgba(15,23,42,.12); border-radius:12px; color:#64748b; font-size:13px; font-weight:850; padding:12px; }
        .live-empty--context { display:grid; gap:5px; padding:14px; }
        .live-empty--context strong { color:#17253f; font-size:16px; }
        .live-empty--context span { line-height:1.4; }
        .live-empty--context button { background:var(--club-admin-accent,#65a30d); border:0; border-radius:9px; color:#fff; font:inherit; font-size:12px; font-weight:950; justify-self:start; margin-top:4px; min-height:38px; padding:8px 12px; }
        .live-agendaList { display:grid; gap:10px; }
        .live-agendaHead { align-items:center; display:flex; gap:8px; justify-content:space-between; }
        .live-agendaHead > div:first-child { display:grid; gap:1px; }
        .live-agendaHead span { color:#64748b; font-size:10px; font-weight:950; letter-spacing:.06em; text-transform:uppercase; }
        .live-agendaHead strong { color:#17253f; font-size:15px; }
        .live-filters { display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; }
        .live-filters button { background:#f8fafc; border:1px solid rgba(15,23,42,.08); border-radius:999px; color:#64748b; font:inherit; font-size:10px; font-weight:900; min-height:28px; padding:4px 7px; }
        .live-filters button.is-active { background:color-mix(in srgb,var(--club-admin-accent,#65a30d) 12%,white); border-color:color-mix(in srgb,var(--club-admin-accent,#65a30d) 36%,transparent); color:#17253f; }
        .live-day { border-top:1px solid rgba(15,23,42,.08); display:grid; gap:7px; padding-top:9px; }
        .live-day > strong { color:#52657a; font-size:11px; font-weight:950; letter-spacing:.05em; text-transform:uppercase; }
        .live-conflicts { background:#fff7df; border:1px solid rgba(217,119,6,.22); border-radius:10px; color:#854d0e; display:grid; gap:2px; padding:8px 10px; }
        .live-conflicts strong { font-size:12px; }
        .live-conflicts span { font-size:11px; font-weight:750; }
        .live-empty--warning { background: #fff7df; border-color: rgba(217,119,6,.24); color: #854d0e; }
        @media (max-width: 900px) {
          .live-agendaHead { align-items:flex-start; flex-direction:column; }
        }
        @media (max-width: 560px) {
          .live-metrics { grid-template-columns:repeat(3,minmax(0,1fr)); }
          .live-matchRow { align-items: start; grid-template-columns: 1fr; }
          .live-matchTeams { grid-template-columns: 1fr; }
          .live-matchTeams span { display: none; }
          .live-status { justify-self: start; }
          .live-matchRow { grid-template-columns:60px minmax(0,1fr) auto; }
          .live-matchTeams { grid-template-columns:1fr; }
          .live-matchTeams span { display:none; }
        }
      `}</style>
    </section>
  )
}
