'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, CircleAlert, Plus, RefreshCw, Settings2, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionSeries, CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import type { CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import SeriesDraftEditor from './SeriesDraftEditor'
import CompetitionBootstrap from './CompetitionBootstrap'
import { hasClubCapability } from '@/lib/clubPermissions'
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
  const { activeClub, clubRole } = useSession()
  const router = useRouter()
  const clubId = activeClub?.id
  const [series, setSeries] = useState<CompetitionSeries[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [detail, setDetail] = useState<CompetitionSeriesDetail | null>(null)
  const [events, setEvents] = useState<CompetitionSeriesEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<(Error & { status?: number; setupRequired?: boolean }) | null>(null)
  const [name, setName] = useState('')
  const [seasonId, setSeasonId] = useState('')

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
      } else if (screen.kind === 'new') {
        const seasonResult = await supabase.from('competition_seasons').select('id,name,status').eq('club_id', clubId).order('starts_on', { ascending: false })
        if (seasonResult.error) throw new Error('No pudimos leer las temporadas del club.')
        const items = (seasonResult.data ?? []) as Season[]; setSeasons(items); setSeasonId((current) => current || items.find((item) => item.status === 'ACTIVE')?.id || items[0]?.id || '')
      } else {
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

  async function createSeries(event: FormEvent) {
    event.preventDefault()
    if (!clubId || !name.trim() || !seasonId) return
    setSaving(true); setError(null)
    try {
      const result = await api<{ series: CompetitionSeries }>(`/api/clubs/${clubId}/competition/series`, { method: 'POST', body: JSON.stringify({ name: name.trim(), season_id: seasonId }) })
      router.replace(`/club/competition/series/${result.series.id}`)
    } catch (cause) { setError(cause instanceof Error ? cause : new Error('No pudimos crear el circuito.')) }
    finally { setSaving(false) }
  }

  if (!clubId) return <div className={styles.page}><div className={styles.state}>Seleccioná un club para continuar.</div></div>
  if (loading) return <div className={styles.page}><div className={styles.skeleton} /><div className={styles.skeletonList}>{[1, 2, 3].map((item) => <i key={item} />)}</div></div>
  if (error) return <div className={styles.page}><ErrorState error={error} retry={() => void load()} /></div>

  if (screen.kind === 'new') return <div className={styles.page}>
    <Header title="Nuevo circuito" detail="Creá el borrador y completalo por etapas." back="/club/competition" />
    <form className={styles.form} onSubmit={createSeries}>
      <label>Nombre del circuito<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Circuito Apertura 2026" maxLength={120} autoFocus /></label>
      <label>Temporada<select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}><option value="">Seleccionar temporada</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name} · {statusLabels[season.status] ?? season.status}</option>)}</select></label>
      {!seasons.length ? <p className={styles.warning}>Primero necesitás una temporada competitiva disponible.</p> : null}
      <div className={styles.sticky}><Link href="/club/competition">Cancelar</Link><button disabled={saving || !name.trim() || !seasonId}>{saving ? 'Creando…' : 'Crear borrador'}</button></div>
    </form>
  </div>

  if (screen.kind === 'detail' && detail) {
    const item = detail.series
    return <div className={styles.page}>
      <Header title={item.name} detail="Configurá el circuito antes de activarlo." back="/club/competition" action={<span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>} />
      {item.status === 'DRAFT' || item.status === 'SCHEDULED' || item.status === 'ACTIVE' ? <SeriesDraftEditor clubId={clubId} detail={detail} events={events} request={api} reload={load} /> : <><section className={styles.summary}><div><small>Estado</small><strong>{statusLabels[item.status]}</strong></div><div><small>Divisiones</small><strong>{detail.divisions.filter((division) => division.is_active).length}</strong></div><div><small>Fechas</small><strong>{events.length}</strong></div></section><section className={styles.section}>{events.map((event) => <div className={styles.row} key={event.id}><div><strong>{event.name}</strong><small>{event.planned_starts_at ? new Date(event.planned_starts_at).toLocaleDateString('es-AR') : 'Sin fecha programada'}</small></div><span>{statusLabels[event.status]}</span></div>)}</section></>}
    </div>
  }

  return <div className={styles.page}>
    <Header title="Circuitos" detail="Organizá temporadas, divisiones y fechas." action={<Link className={styles.primary} href="/club/competition/series/new"><Plus size={17} />Crear</Link>} />
    <Link className={styles.card} href="/club/competition/points-schemes"><div><span className={styles.badge}>PUNTAJE</span><h2>Esquemas de puntos</h2><p>Configurá cómo se otorgan puntos en cada circuito.</p></div><Settings2 size={20} /></Link>
    {hasClubCapability(clubRole, 'competition:manage') ? <CompetitionBootstrap clubId={clubId} request={api} /> : null}
    <section className={styles.summary}><div><small>Total</small><strong>{series.length}</strong></div><div><small>Activos</small><strong>{counts.active}</strong></div><div><small>Borradores</small><strong>{counts.draft}</strong></div></section>
    {!series.length ? <div className={styles.empty}><Trophy size={26} /><strong>Tu primer circuito empieza acá</strong><p>Creá un borrador para definir divisiones, reglas y fechas sin publicar nada todavía.</p><Link className={styles.primary} href="/club/competition/series/new">Crear circuito</Link></div> : <section className={styles.list}>{series.map((item) => <Link href={`/club/competition/series/${item.id}`} className={styles.card} key={item.id}><div><span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span><h2>{item.name}</h2><p>{item.description || 'Configuración competitiva del club'}</p><small>{seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada'}</small></div><ChevronRight size={20} /></Link>)}</section>}
  </div>
}
