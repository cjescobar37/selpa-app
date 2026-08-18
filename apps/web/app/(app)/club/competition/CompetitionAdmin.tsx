'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, ChevronRight, CircleAlert, Medal, RefreshCw, Settings2, Trophy } from 'lucide-react'
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
    <div className={styles.heroTop}>{back ? <Link href={back} className={styles.back} aria-label="Volver"><ArrowLeft size={18} /></Link> : null}<span>COMPETENCIAS</span></div>
    <div className={styles.heading}><div><h1>{title}</h1><p>{detail}</p></div>{action}</div>
  </header>
}

function seriesOperationalLine(item: CompetitionSeries) {
  const dates = item.planned_events_count ?? 0
  if (item.status === 'CLOSED') return 'Circuito finalizado.'
  if (!dates) return 'Próximo paso: agregá la primera fecha.'
  return dates === 1 ? '1 fecha programada.' : `${dates} fechas planificadas.`
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
        const seriesDetail = await api<CompetitionSeriesDetail>(`/api/clubs/${clubId}/competition/series/${screen.seriesId}`)
        const [eventData, seasonResult] = await Promise.all([
          api<{ events: CompetitionSeriesEvent[] }>(`/api/clubs/${clubId}/competition/series/${screen.seriesId}/events`),
          supabase.from('competition_seasons').select('id,name,status').eq('club_id', clubId).eq('id', seriesDetail.series.season_id).limit(1),
        ])
        setDetail(seriesDetail); setEvents(eventData.events)
        if (!seasonResult.error) setSeasons((seasonResult.data ?? []) as Season[])
      }
    } catch (cause) { setError(cause instanceof Error ? cause : new Error('No pudimos cargar Competencia.')) }
    finally { setLoading(false) }
  }, [clubId, screen])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const counts = useMemo(() => ({ active: series.filter((item) => item.status === 'ACTIVE').length, draft: series.filter((item) => item.status === 'DRAFT').length }), [series])
  const featuredSeries = series.find((item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED')
  const remainingSeries = featuredSeries ? series.filter((item) => item.id !== featuredSeries.id) : series

  if (!clubId) return <div className={styles.page}><div className={styles.state}>Seleccioná un club para continuar.</div></div>
  if (loading) return <div className={styles.page}><div className={styles.skeleton} /><div className={styles.skeletonList}>{[1, 2, 3].map((item) => <i key={item} />)}</div></div>
  if (error) return <div className={styles.page}><ErrorState error={error} retry={() => void load()} /></div>

  if (screen.kind === 'new') return <SeriesCreateWizard clubId={clubId} request={api} />

  if (screen.kind === 'detail' && detail) {
    const item = detail.series
    const hasEvents = events.length > 0
    const seasonName = seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada del circuito'
    const canAddDate = item.status === 'SCHEDULED' || item.status === 'ACTIVE'
    return <div className={styles.page}>
      <Header title={item.name} detail={seasonName} back="/club/competition" action={<span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>} />
      <section className={styles.summary}><div><small>Progreso</small><strong>{events.length}/{item.planned_events_count ?? 0}</strong></div><div><small>Próxima fecha</small><strong>{events.find((event) => event.status !== 'COMPLETED' && event.status !== 'CANCELLED')?.planned_starts_at ? new Date(events.find((event) => event.status !== 'COMPLETED' && event.status !== 'CANCELLED')!.planned_starts_at!).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : 'Pendiente'}</strong></div><div><small>Estado</small><strong>{statusLabels[item.status]}</strong></div></section>
      <section className={styles.section}><div className={styles.sectionHead}><span>FECHAS DEL CIRCUITO</span><h2>{hasEvents ? 'Agenda del circuito' : 'La primera fecha está pendiente'}</h2><p>{hasEvents ? 'Cada fecha se administra como un torneo real del club.' : 'Creá el primer torneo para poner el circuito en marcha.'}</p></div>{canAddDate ? <Link className={styles.primary} href={`/club/torneos/nuevo?competitionSeriesId=${item.id}&competitionSeasonId=${item.season_id}`}>+ {hasEvents ? 'Agregar fecha' : 'Agregar primera fecha'}</Link> : null}<SeriesEventsAdmin clubId={clubId} series={detail} events={events} request={api} reload={load} hideCreate /></section>
      {(item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'ACTIVE') ? <details className={styles.section}><summary>Configuración del circuito</summary><SeriesDraftEditor clubId={clubId} detail={detail} events={events} request={api} reload={load} /></details> : null}
    </div>
  }

  return <div className={styles.page}>
    <Header title="Competencias del club" detail="Organizá torneos y circuitos del club desde un único lugar." />
    <section className={styles.productList} aria-label="Crear una competencia">
      <Link className={styles.productCard} href="/club/torneos/nuevo"><span className={styles.productIcon}><CalendarDays size={21} /></span><div><h2>Crear torneo</h2><p><b>Competencia independiente.</b><br />Inscripciones, cuadros, resultados y campeón.</p></div><ChevronRight size={20} /></Link>
      <Link className={styles.productCard} href="/club/competition/series/new"><span className={styles.productIcon}><Medal size={21} /></span><div><h2>Crear circuito</h2><p><b>Varias fechas.</b><br />Ranking anual, tabla de puntos y campeón del circuito.</p></div><ChevronRight size={20} /></Link>
    </section>
    {!series.length ? <div className={styles.empty}><Trophy size={26} /><strong>Tu primer circuito empieza acá</strong><p>Elegí Circuito arriba para definir sus reglas y agregar fechas cuando estés listo.</p></div> : <>
      {featuredSeries ? <section className={styles.featuredSection}><div className={styles.listTitle}><span>CIRCUITO DESTACADO</span></div><Link href={`/club/competition/series/${featuredSeries.id}`} className={styles.featuredCard}><span className={`${styles.badge} ${styles[`status_${featuredSeries.status}`]}`}>{statusLabels[featuredSeries.status]}</span><div><h2>{featuredSeries.name}</h2><p>{seasons.find((season) => season.id === featuredSeries.season_id)?.name ?? 'Temporada'}</p><div className={styles.featuredProgress}><span>{seriesOperationalLine(featuredSeries)}</span><b>{(featuredSeries.planned_events_count ?? 0) ? `${featuredSeries.planned_events_count} fechas` : 'Primera fecha pendiente'}</b></div></div><ChevronRight size={22} /></Link></section> : null}
      {remainingSeries.length ? <section className={styles.seriesSection}><div className={styles.listTitle}><span>MIS CIRCUITOS</span><h2>Todos los circuitos</h2></div><div className={styles.seriesList}>{remainingSeries.map((item) => <Link href={`/club/competition/series/${item.id}`} className={styles.seriesCard} key={item.id}><span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span><div><h2>{item.name}</h2><p>{seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada'}</p><div className={styles.seriesMeta}><span>{(item.planned_events_count ?? 0) ? `${item.planned_events_count} ${item.planned_events_count === 1 ? 'fecha' : 'fechas'}` : 'Sin fechas'}</span></div></div><ChevronRight size={20} /></Link>)}</div></section> : null}
    </>}
    <section className={styles.competitionSummary}><div><small>Circuitos creados</small><strong>{series.length}</strong></div><div><small>En actividad</small><strong>{counts.active}</strong></div><div><small>Pendientes de configurar</small><strong>{counts.draft}</strong></div></section>
    <Link href="/club/competition/points-schemes" className={styles.pointsTool}><span><Settings2 size={18} /></span><div><strong>Tablas de puntos</strong><small>Herramienta para definir cómo suma cada circuito.</small></div><ChevronRight size={18} /></Link>
  </div>
}
