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

export function TournamentLiveAgendaTab({ clubId, tournamentId }: Props) {
  const [agenda, setAgenda] = useState<LiveAgendaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const timeline = agenda?.timeline ?? []
  const scheduledCourts = useMemo(
    () => (agenda?.courts ?? []).filter((court) => court.matches.length > 0),
    [agenda?.courts]
  )

  if (loading && !agenda) {
    return <div className="live-empty">Cargando agenda del torneo...</div>
  }

  if (error) {
    return <div className="live-empty live-empty--warning">{error}</div>
  }

  return (
    <section className="live-agenda">
      <div className="live-metrics">
        <div className="live-metric">
          <span>Pendientes</span>
          <strong>{agenda?.metrics.pendingMatches ?? 0}</strong>
        </div>
        <div className="live-metric live-metric--late">
          <span>Atrasados</span>
          <strong>{agenda?.metrics.lateMatches ?? 0}</strong>
        </div>
        <div className="live-metric live-metric--live">
          <span>En curso</span>
          <strong>{agenda?.metrics.probablyInProgressMatches ?? 0}</strong>
        </div>
      </div>

      <section className="live-section">
        <div className="live-sectionHead">
          <span>Por cancha</span>
          <strong>{scheduledCourts.length} cancha{scheduledCourts.length === 1 ? '' : 's'}</strong>
        </div>
        {scheduledCourts.length > 0 ? (
          <div className="live-courtGrid">
            {scheduledCourts.map((court) => (
              <article key={court.key} className="live-courtCard">
                <header>
                  <strong>{court.courtName ?? 'Sin cancha'}</strong>
                  <span>{court.matches.length} partido{court.matches.length === 1 ? '' : 's'}</span>
                </header>
                <div className="live-matchList">
                  {court.matches.map((match) => <LiveMatchRow key={match.id} match={match} />)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="live-empty">Todavía no hay partidos con cancha asignada.</div>
        )}
      </section>

      <section className="live-section">
        <div className="live-sectionHead">
          <span>Timeline</span>
          <strong>{timeline.length} partido{timeline.length === 1 ? '' : 's'}</strong>
        </div>
        {timeline.length > 0 ? (
          <div className="live-timeline">
            {timeline.map((match) => <LiveMatchRow key={match.id} match={match} compactCourt />)}
          </div>
        ) : (
          <div className="live-empty">Todavía no hay partidos para mostrar en agenda.</div>
        )}
      </section>

      <style jsx>{`
        .live-agenda { display: grid; gap: 12px; min-width: 0; }
        .live-metrics { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .live-metric { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 12px; display: grid; gap: 3px; min-width: 0; padding: 11px 12px; }
        .live-metric span { color: #64748b; font-size: 11px; font-weight: 950; text-transform: uppercase; }
        .live-metric strong { color: #17253f; font-size: 24px; font-weight: 950; line-height: 1; }
        .live-metric--late { background: #fff7ed; border-color: rgba(217,119,6,.18); }
        .live-metric--live { background: #ecfdf3; border-color: rgba(22,163,74,.18); }
        .live-section { background: #fff; border: 1px solid rgba(15,23,42,.08); border-radius: 14px; display: grid; gap: 10px; min-width: 0; padding: 12px; }
        .live-sectionHead { align-items: center; display: flex; gap: 10px; justify-content: space-between; min-width: 0; }
        .live-sectionHead span { color: #17253f; font-size: 15px; font-weight: 950; }
        .live-sectionHead strong { color: #64748b; font-size: 12px; font-weight: 900; white-space: nowrap; }
        .live-courtGrid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); min-width: 0; }
        .live-courtCard { background: #f8fafc; border: 1px solid rgba(15,23,42,.07); border-radius: 12px; display: grid; gap: 8px; min-width: 0; padding: 10px; }
        .live-courtCard header { align-items: center; display: flex; gap: 8px; justify-content: space-between; min-width: 0; }
        .live-courtCard header strong { color: #17253f; font-size: 14px; font-weight: 950; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .live-courtCard header span { color: #64748b; font-size: 11px; font-weight: 900; white-space: nowrap; }
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
        .live-empty { background: #f8fafc; border: 1px dashed rgba(15,23,42,.12); border-radius: 12px; color: #64748b; font-size: 13px; font-weight: 850; padding: 12px; }
        .live-empty--warning { background: #fff7df; border-color: rgba(217,119,6,.24); color: #854d0e; }
        @media (max-width: 900px) {
          .live-courtGrid { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .live-metrics { grid-template-columns: 1fr; }
          .live-matchRow { align-items: start; grid-template-columns: 1fr; }
          .live-matchTeams { grid-template-columns: 1fr; }
          .live-matchTeams span { display: none; }
          .live-status { justify-self: start; }
        }
      `}</style>
    </section>
  )
}
