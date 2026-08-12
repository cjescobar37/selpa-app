'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, CircleAlert, Plus, RefreshCw, Settings2, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionSeries, CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import type { CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import SeriesDraftEditor from './SeriesDraftEditor'
import SeriesCreateWizard from './SeriesCreateWizard'
import SeriesEventsAdmin from './SeriesEventsAdmin'
import styles from './competition.module.css'

type Season = { id: string; name: string; status: string }
type ApiError = { error?: string; setupRequired?: boolean }
type Screen = { kind: 'list' } | { kind: 'new' } | { kind: 'detail'; seriesId: string }

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', CLOSED: 'Cerrado',
  CANCELLED: 'Cancelado', COMPLETED: 'Completado',
}

async function token() {
  return (await supabase.auth.getSession()).data.session?.access_token ?? ''
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  const payload = await response.json().catch(() => ({})) as T & ApiError
  if (!response.ok) {
    const error = new Error(payload.error || 'No pudimos completar la operación.') as Error & { status?: number; setupRequired?: boolean }
    error.status = response.status; error.setupRequired = payload.setupRequired
    throw error
  }
  return payload
}

function ErrorState({ error, retry }: { error: Error & { status?: number; setupRequired?: boolean }; retry: () => void }) {
  const detail = error.setupRequired
    ? 'Falta habilitar la estructura competitiva del club.'
    : error.status === 403 ? 'Tu rol no tiene permiso para administrar circuitos.'
      : error.status === 404 ? 'El circuito solicitado ya no existe.'
        : error.status === 409 || error.status === 412 ? 'Los datos cambiaron. Actualizá antes de continuar.' : error.message
  return <div className={styles.state}><CircleAlert size={22} /><strong>No pudimos cargar Competencia</strong><p>{detail}</p><button onClick={retry}><RefreshCw size={16} />Reintentar</button></div>
}

function Header({ title, detail, back, action }: { title: string; detail: string; back?: string; action?: ReactNode }) {
  return <header className={styles.hero}>
    <div className={styles.heroTop}>{back ? <Link href={back} className={styles.back} aria-label="Volver"><ArrowLeft size={18} /></Link> : null}<span>COMPETENCIA</span></div>
    <div className={styles.heading}><div><h1>{title}</h1><p>{detail}</p></div>{action}</div>
  </header>
}

export default function CompetitionAdmin({ screen }: { screen: Screen }) {
  const { activeClub } = useSession()
  const clubId = activeClub?.id
  const [series, setSeries] = useState<CompetitionSeries[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [detail, setDetail] = useState<CompetitionSeriesDetail | null>(null)
  const [events, setEvents] = useState<CompetitionSeriesEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<(Error & { status?: number; setupRequired?: boolean }) | null>(null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true); setError(null)
    try {
      if (screen.kind === 'list') {
        const [{ series: items }, seasonResult] = await Promise.all([
          api<{ series: CompetitionSeries[] }>(`/api/clubs/${clubId}/competition/series`),
          supabase.from('competition_seasons').select('id,name,status').eq('club_id', clubId).order('starts_on', { ascending: false }),
        ])
        if (seasonResult.error) throw new Error('No pudimos leer las temporadas del club.')
        setSeries(items); setSeasons((seasonResult.data ?? []) as Season[])
      } else if (screen.kind === 'detail') {
        const [seriesDetail, eventData] = await Promise.all([
          api<CompetitionSeriesDetail>(`/api/clubs/${clubId}/competition/series/${screen.seriesId}`),
          api<{ events: CompetitionSeriesEvent[] }>(`/api/clubs/${clubId}/competition/series/${screen.seriesId}/events`),
        ])
        setDetail(seriesDetail); setEvents(eventData.events)
      }
    } catch (cause) { setError(cause instanceof Error ? cause : new Error('No pudimos cargar Competencia.')) }
    finally { setLoading(false) }
  }, [clubId, screen])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const counts = useMemo(() => ({ active: series.filter((item) => item.status === 'ACTIVE').length, draft: series.filter((item) => item.status === 'DRAFT').length }), [series])

  if (!clubId) return <div className={styles.page}><div className={styles.state}>Seleccioná un club para continuar.</div></div>
  if (loading) return <div className={styles.page}><div className={styles.skeleton} /><div className={styles.skeletonList}>{[1, 2, 3].map((item) => <i key={item} />)}</div></div>
  if (error) return <div className={styles.page}><ErrorState error={error} retry={() => void load()} /></div>

  if (screen.kind === 'new') return <SeriesCreateWizard clubId={clubId} request={api} />

  if (screen.kind === 'detail' && detail) {
    const item = detail.series
    return <div className={styles.page}>
      <Header title={item.name} detail="Centro del circuito" back="/club/competition" action={<span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>} />
      <section className={styles.summary}><div><small>Fechas</small><strong>{events.length}/{item.planned_events_count ?? 0}</strong></div><div><small>Próxima fecha</small><strong>{events.find((event) => event.status !== 'COMPLETED' && event.status !== 'CANCELLED')?.planned_starts_at ? new Date(events.find((event) => event.status !== 'COMPLETED' && event.status !== 'CANCELLED')!.planned_starts_at!).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : 'Pendiente'}</strong></div><div><small>Ranking</small><strong>Próximamente</strong></div></section>
      <section className={styles.section}><div className={styles.sectionHead}><span>FECHAS DEL CIRCUITO</span><h2>Agenda operativa</h2></div><Link className={styles.primary} href={`/club/torneos/nuevo?competitionSeriesId=${item.id}&competitionSeasonId=${item.season_id}`}>+ Agregar fecha</Link><SeriesEventsAdmin clubId={clubId} series={detail} events={events} request={api} reload={load} /></section>
      {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'ACTIVE') ? <details className={styles.section}><summary>Configuración del circuito</summary><SeriesDraftEditor clubId={clubId} detail={detail} events={events} request={api} reload={load} /></details> : null}
    </div>
  }

  return <div className={styles.page}>
    <Header title="Competencias" detail="¿Qué querés organizar?" action={<Link className={styles.primary} href="/club/competition/series/new"><Plus size={17} />Crear circuito</Link>} />
    <section className={styles.list} aria-label="Crear una competencia">
      <Link className={styles.card} href="/club/torneos/nuevo"><div><span className={styles.badge}>TORNEO</span><h2>Competencia independiente</h2><p>Una fecha con sus propias inscripciones y resultados.</p></div><ChevronRight size={18} /></Link>
      <Link className={styles.card} href="/club/competition/series/new"><div><span className={styles.badge}>CIRCUITO</span><h2>Varias fechas, un ranking</h2><p>Fechas que comparten reglas y tabla de puntos.</p></div><ChevronRight size={18} /></Link>
    </section>
    <section className={styles.summary}><div><small>Total</small><strong>{series.length}</strong></div><div><small>Activos</small><strong>{counts.active}</strong></div><div><small>Borradores</small><strong>{counts.draft}</strong></div></section>
    <div style={{ margin: '12px 0' }}><Link href="/club/competition/points-schemes" style={{ alignItems: 'center', color: '#50617a', display: 'inline-flex', fontSize: 12, fontWeight: 800, gap: 6, textDecoration: 'none' }}><Settings2 size={16} />Tablas de puntos</Link></div>
    {!series.length ? <div className={styles.empty}><Trophy size={26} /><strong>Tu primer circuito empieza acá</strong><p>Definí sus reglas y agregá fechas cuando estés listo.</p><Link className={styles.primary} href="/club/competition/series/new">Crear circuito</Link></div> : <section className={styles.list}>{series.map((item) => <Link href={`/club/competition/series/${item.id}`} className={styles.card} key={item.id}><div><span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span><h2>{item.name}</h2><p>{item.description || 'Circuito del club'}</p><small>{seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada'}</small></div><ChevronRight size={20} /></Link>)}</section>}
  </div>
}
