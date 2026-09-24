'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Pencil, Repeat2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { PlayoffScheduleReservation } from '@/lib/tournamentPlayoffScheduleReservations'
import type { MatchScheduleAssignment, TournamentCourtConfig } from '@/lib/tournamentSchedule'
import styles from './TournamentScheduleManager.module.css'

type Match = {
  id: string
  phase: string | null
  status: string | null
  scheduled_at?: string | null
  court_name?: string | null
  court_id?: string | null
  team1_name?: string | null
  team2_name?: string | null
  round: number
  match_order: number
  group_match_number?: number | null
}

type Props = {
  open: boolean
  clubId: string
  tournamentId: string
  matches: Match[]
  startDate: string
  endDate: string
  autoMode: boolean
  initialMatch?: Match | null
  onClose: () => void
  onSwap: (match: Match) => void
  onMatchScheduled: (matchId: string, assignment: MatchScheduleAssignment) => void
  onCompleteSchedule: () => void
}

type ScheduleData = {
  category: string | null
  reservations: Record<string, PlayoffScheduleReservation>
  courts: TournamentCourtConfig[]
  assignments: Record<string, MatchScheduleAssignment>
}

const phaseLabel = (phase: string | null) => ({
  GROUP: 'Grupos', EIGHTHS: 'Octavos', QUARTER: 'Cuartos', SEMI: 'Semifinal', FINAL: 'Final',
  ROUND_OF_16: '16avos', ROUND_OF_32: '32avos',
}[String(phase)] ?? String(phase ?? 'Partido'))

const code = (match: Match) => String(match.phase).toUpperCase() === 'GROUP'
  ? `G${match.group_match_number ?? match.match_order}`
  : `${({ EIGHTHS: 'O', QUARTER: 'C', SEMI: 'S', FINAL: 'F', ROUND_OF_16: 'D', ROUND_OF_32: 'R' } as Record<string, string>)[String(match.phase)] ?? ''}${match.match_order}`

function localInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function courtKey(court: TournamentCourtConfig) {
  return court.id ? `id:${court.id}` : `name:${court.source}:${court.name}`
}

export default function TournamentScheduleManager(props: Props) {
  const [data, setData] = useState<ScheduleData>({ category: null, reservations: {}, courts: [], assignments: {} })
  const [filter, setFilter] = useState<'all' | 'groups' | 'playoff' | 'missing'>('all')
  const [editing, setEditing] = useState<Match | null>(null)
  const [dateTime, setDateTime] = useState('')
  const [selectedCourt, setSelectedCourt] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [scheduleWarning, setScheduleWarning] = useState('')
  const [notice, setNotice] = useState('')

  const loadSchedule = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) return
    const response = await fetch(`/api/clubs/${props.clubId}/tournaments/${props.tournamentId}/playoff/schedule`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    })
    if (!response.ok) return
    const json = await response.json()
    const next: ScheduleData = {
      category: json.category ?? null, reservations: json.reservations ?? {},
      courts: json.courts ?? [], assignments: json.assignments ?? {},
    }
    setData(next)
    if (props.initialMatch) {
      const assignment = next.assignments[props.initialMatch.id]
      setEditing(props.initialMatch)
      setDateTime(localInput(assignment?.scheduled_at ?? props.initialMatch.scheduled_at))
      const court = next.courts.find((item) => item.id === (assignment?.court_id ?? props.initialMatch?.court_id) || item.name === (assignment?.court_name ?? props.initialMatch?.court_name))
      setSelectedCourt(court ? courtKey(court) : '')
    }
  }, [props.clubId, props.initialMatch, props.tournamentId])

  useEffect(() => { if (props.open) queueMicrotask(() => void loadSchedule()) }, [loadSchedule, props.open])

  const entries = useMemo(() => {
    const real = props.matches.map((match) => {
      const assignment = data.assignments[match.id]
      return {
        kind: 'match' as const, id: match.id, phase: String(match.phase), order: match.match_order,
        scheduledAt: assignment?.scheduled_at ?? match.scheduled_at ?? null,
        court: assignment?.court_name ?? match.court_name ?? null,
        label: `${phaseLabel(match.phase)} · ${code(match)}`,
        teams: `${match.team1_name ?? 'Equipo 1'} / ${match.team2_name ?? 'Equipo 2'} · ${assignment?.schedule_origin ?? 'AUTO'}`,
        status: match.status, match,
      }
    })
    const future = Object.entries(data.reservations).map(([id, reservation]) => ({
      kind: 'reservation' as const, id, phase: reservation.phase, order: reservation.match_order,
      scheduledAt: reservation.scheduled_at, court: reservation.court_name,
      label: `${phaseLabel(reservation.phase)} · ${code({ phase: reservation.phase, match_order: reservation.match_order } as Match)}`,
      teams: `${reservation.phase === 'FINAL' ? 'Ganador S1 vs Ganador S2' : 'Cruce definido por la llave'} · ${reservation.schedule_origin ?? 'AUTO'}`,
      status: 'FUTURE',
    }))
    return [...real, ...future]
      .filter((entry) => filter === 'all' || filter === 'missing' ? !entry.scheduledAt : filter === 'groups' ? entry.phase === 'GROUP' : entry.phase !== 'GROUP')
      .sort((left, right) => (left.scheduledAt ? Date.parse(left.scheduledAt) : Infinity) - (right.scheduledAt ? Date.parse(right.scheduledAt) : Infinity) || String(left.court ?? '').localeCompare(String(right.court ?? '')) || left.order - right.order)
  }, [data.assignments, data.reservations, filter, props.matches])

  function openEditor(match: Match) {
    const assignment = data.assignments[match.id]
    setEditing(match)
    setDateTime(localInput(assignment?.scheduled_at ?? match.scheduled_at))
    const court = data.courts.find((item) => item.id === (assignment?.court_id ?? match.court_id) || item.name === (assignment?.court_name ?? match.court_name))
    setSelectedCourt(court ? courtKey(court) : '')
    setError('')
    setScheduleWarning('')
  }

  async function save(confirmWarning = false) {
    if (!editing) return
    const court = data.courts.find((item) => courtKey(item) === selectedCourt)
    if (!dateTime || !court) { setError('Elegí fecha, hora y cancha.'); return }
    setSaving(true)
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    const response = await fetch(`/api/clubs/${props.clubId}/tournaments/${props.tournamentId}/matches/${editing.id}/schedule`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: new Date(dateTime).toISOString(), court_id: court.id, court_name: court.name, court_source: court.source, confirm_short_rest: confirmWarning }),
    })
    const json = await response.json().catch(() => ({}))
    setSaving(false)
    if (response.status === 409 && ['SHORT_REST_WARNING', 'SCHEDULE_WARNING'].includes(json.code) && !confirmWarning) { setScheduleWarning(json.warning); return }
    if (!response.ok) { setError(json.error ?? 'No pude guardar la programación.'); return }
    setData((current) => ({ ...current, assignments: { ...current.assignments, [editing.id]: json.assignment } }))
    props.onMatchScheduled(editing.id, json.assignment)
    setEditing(null)
    setScheduleWarning('')
    setNotice('Partido reprogramado.')
  }

  if (!props.open) return null
  return <div className={styles.backdrop}>
    <section className={styles.panel} aria-label="Programación del torneo">
      <header><div><span>Centro operativo</span><h2>Programación</h2></div><button onClick={props.onClose} aria-label="Cerrar"><X size={20} /></button></header>
      <div className={styles.toolbar}>
        <div className={styles.filters}>{([['all', 'Todos'], ['groups', 'Grupos'], ['playoff', 'Playoff'], ['missing', 'Sin programar']] as const).map(([value, label]) => <button key={value} className={filter === value ? styles.active : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {props.autoMode && <button className={styles.auto} onClick={props.onCompleteSchedule}><CalendarClock size={16} />Completar calendario</button>}
      </div>
      {notice && <p className={styles.notice}>{notice}</p>}
      <div className={styles.list}>{entries.map((entry) => <article key={`${entry.kind}-${entry.id}`}>
        <time>{entry.scheduledAt ? new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.scheduledAt)) : 'Sin horario'}</time>
        <div><strong>{entry.label}</strong><span>{entry.court ?? 'Sin cancha'} · {entry.teams}</span></div>
        {entry.kind === 'match' && entry.status === 'PENDING' && <div className={styles.actions}>
          <button aria-label={`Reprogramar ${entry.label}`} onClick={() => openEditor(entry.match)}><Pencil size={15} /><span>Reprogramar</span></button>
          <button aria-label={`Cambiar ${entry.label}`} disabled={!entry.scheduledAt} onClick={() => props.onSwap(entry.match)}><Repeat2 size={15} /><span>Cambiar</span></button>
        </div>}
      </article>)}</div>
      <footer className={styles.panelFooter}><button type="button" onClick={props.onClose}>Cerrar</button></footer>
    </section>

    {editing && <div className={styles.editor}><section>
      <header><h3>{data.assignments[editing.id]?.scheduled_at ?? editing.scheduled_at ? 'Reprogramar partido' : 'Programar partido'}</h3><button aria-label="Cerrar" onClick={() => setEditing(null)}><X size={19} /></button></header>
      <label>Fecha y hora<input type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} /></label>
      <label>Cancha<select value={selectedCourt} onChange={(event) => setSelectedCourt(event.target.value)}><option value="">Seleccioná una cancha</option>{data.courts.map((court) => <option key={courtKey(court)} value={courtKey(court)}>{court.name}</option>)}</select></label>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.editorActions}><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className={styles.save} disabled={saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
    </section></div>}

    {scheduleWarning && <div className={styles.editor}><section>
      <header><h3>Confirmar programación</h3><button aria-label="Cerrar" onClick={() => setScheduleWarning('')}><X size={19} /></button></header>
      <p className={styles.warning}>{scheduleWarning}</p>
      <div className={styles.editorActions}><button type="button" onClick={() => setScheduleWarning('')}>Cancelar</button><button type="button" className={styles.save} onClick={() => void save(true)}>Guardar igualmente</button></div>
    </section></div>}
  </div>
}
