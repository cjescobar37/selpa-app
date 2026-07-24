'use client'

import Link from 'next/link'
import { CalendarDays, ChevronRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import {
  formatTournamentTypeLabel,
} from '@/lib/tournamentLabels'
import styles from './calendario.module.css'

type Tournament = {
  id: string
  name: string
  status: string
  type: string | null
  gender: string | null
  category_name: string | null
  start_date: string | null
  end_date: string | null
  registration_deadline: string | null
  max_pairs: number | null
  rules_json?: Record<string, unknown> | null
}

const genderLabels: Record<string, string> = {
  MALE: 'Masculino',
  FEMALE: 'Femenino',
  MIXED: 'Mixto',
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Activo',
  CANCELLED: 'Cancelado',
  CLOSED: 'Cerrado',
  COMPLETED: 'Finalizado',
  DRAFT: 'Borrador',
  FINISHED: 'Finalizado',
  IN_PROGRESS: 'En juego',
  OPEN: 'Inscripción abierta',
  PUBLISHED: 'Publicado',
  REGISTRATION_OPEN: 'Inscripción abierta',
  RUNNING: 'En juego',
}

const finishedStatuses = new Set(['CANCELLED', 'CLOSED', 'COMPLETED', 'FINISHED', 'FINALIZED'])

function dateValue(tournament: Tournament) {
  return tournament.start_date ?? tournament.end_date ?? tournament.registration_deadline
}

function formatDate(value: string | null) {
  if (!value) return 'Fecha por definir'
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Fecha por definir'
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

function monthKey(tournament: Tournament) {
  const value = dateValue(tournament)
  if (!value) return 'sin-fecha'
  return value.slice(0, 7)
}

function monthLabel(tournament: Tournament) {
  const value = dateValue(tournament)
  if (!value) return 'Sin fecha'
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha'
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(parsed)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function scheduleLabel(tournament: Tournament) {
  const schedule = tournament.rules_json?.schedule_config
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) return null
  const record = schedule as Record<string, unknown>
  const start = typeof record.day_start_time === 'string' ? record.day_start_time : null
  const end = typeof record.day_end_time === 'string' ? record.day_end_time : null
  return start && end ? `${start}–${end}` : start ? `Desde ${start}` : null
}

export default function ClubTournamentCalendarPage() {
  const { activeClub } = useSession()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'all' | 'upcoming' | 'finished'>('all')

  async function load() {
    if (!activeClub?.id) {
      setTournaments([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setError('Tu sesión venció. Volvé a ingresar para consultar el calendario.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`/api/clubs/${activeClub.id}/tournaments`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error ?? 'No pudimos cargar el calendario.')
      setTournaments((body?.tournaments ?? []) as Tournament[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No pudimos cargar el calendario.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClub?.id])

  const visibleTournaments = useMemo(() => {
    return [...tournaments]
      .filter((tournament) => {
        const finished = finishedStatuses.has(tournament.status.toUpperCase())
        if (status === 'finished') return finished
        if (status === 'upcoming') return !finished
        return true
      })
      .sort((a, b) => (dateValue(a) ?? '9999').localeCompare(dateValue(b) ?? '9999'))
  }, [status, tournaments])

  const groups = useMemo(() => {
    const grouped = new Map<string, { label: string; rows: Tournament[] }>()
    visibleTournaments.forEach((tournament) => {
      const key = monthKey(tournament)
      const group = grouped.get(key) ?? { label: monthLabel(tournament), rows: [] }
      group.rows.push(tournament)
      grouped.set(key, group)
    })
    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        if (left === 'sin-fecha') return 1
        if (right === 'sin-fecha') return -1
        return left.localeCompare(right)
      })
      .map(([, group]) => group)
  }, [visibleTournaments])

  return (
    <main className={styles.page}>
      <nav className={styles.backNav} aria-label="Navegación secundaria">
        <Link href="/club/torneos">← Volver a torneos</Link>
      </nav>

      <header className={styles.header}>
        <div>
          <span>Competencia</span>
          <h1>Calendario</h1>
          <p>Fechas y estado de los torneos de {activeClub?.name ?? 'tu club'}.</p>
        </div>
        <CalendarDays aria-hidden="true" size={24} />
      </header>

      <div className={styles.filters} aria-label="Filtrar calendario">
        <button aria-pressed={status === 'all'} onClick={() => setStatus('all')} type="button">Todos</button>
        <button aria-pressed={status === 'upcoming'} onClick={() => setStatus('upcoming')} type="button">Próximos</button>
        <button aria-pressed={status === 'finished'} onClick={() => setStatus('finished')} type="button">Finalizados</button>
      </div>

      {loading ? (
        <section className={styles.skeletons} aria-busy="true" aria-label="Cargando calendario">
          {[0, 1, 2].map((item) => <span key={item} />)}
        </section>
      ) : error ? (
        <section className={styles.state} role="alert">
          <strong>No pudimos cargar el calendario</strong>
          <p>{error}</p>
          <button onClick={() => void load()} type="button"><RotateCcw size={16} /> Reintentar</button>
        </section>
      ) : groups.length === 0 ? (
        <section className={styles.state}>
          <CalendarDays aria-hidden="true" size={22} />
          <strong>No hay torneos para mostrar</strong>
          <p>{tournaments.length ? 'No hay resultados para este filtro.' : 'Cuando el club cree un torneo, aparecerá acá.'}</p>
          {tournaments.length === 0 ? <Link href="/club/torneos/nuevo">Crear torneo</Link> : null}
        </section>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section className={styles.month} key={group.label}>
              <div className={styles.monthTitle}>
                <h2>{group.label}</h2>
                <span>{group.rows.length}</span>
              </div>
              <div className={styles.list}>
                {group.rows.map((tournament) => {
                  const schedule = scheduleLabel(tournament)
                  return (
                    <Link className={styles.card} href={`/club/torneos/${tournament.id}`} key={tournament.id}>
                      <time dateTime={dateValue(tournament) ?? undefined}>{formatDate(dateValue(tournament))}</time>
                      <div className={styles.cardMain}>
                        <div>
                          <h3>{tournament.name}</h3>
                          <span>{statusLabels[tournament.status.toUpperCase()] ?? tournament.status}</span>
                        </div>
                        <p>
                          {[tournament.category_name, tournament.gender ? genderLabels[tournament.gender] ?? tournament.gender : null, formatTournamentTypeLabel(tournament.type)].filter(Boolean).join(' · ')}
                        </p>
                        <small>
                          {schedule ? `Horario ${schedule}` : tournament.registration_deadline ? `Inscripción hasta ${formatDate(tournament.registration_deadline)}` : 'Inscripción sin cierre informado'}
                          {tournament.max_pairs ? ` · Cupo ${tournament.max_pairs} parejas` : ''}
                        </small>
                      </div>
                      <ChevronRight aria-hidden="true" size={19} />
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
