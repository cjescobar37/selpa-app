'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, CalendarDays, ChevronRight, CircleAlert, ListChecks, Medal, RefreshCw, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import ClubAdminHubNav from '@/components/club/ClubAdminHubNav'
import ClubBackLink from '@/components/club/ClubBackLink'
import { hasAnyClubPermission } from '@/lib/clubPermissions'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionSeries, CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import { formatCompetitionDateRange } from '@/features/competition/series/competition-series-date'
import type { CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import { deriveCompetitionEventNextAction, deriveCompetitionEventOperationalState, deriveCompetitionEventPipelineState, selectCompetitionFocusEvent, selectNextCompetitionEvent, sortCompetitionPointsRules } from '@/lib/competitionTournamentState'
import SeriesDraftEditor from './SeriesDraftEditor'
import SeriesCreateWizard from './SeriesCreateWizard'
import SeriesEventsAdmin from './SeriesEventsAdmin'
import SeriesPrizesPanel from './SeriesPrizesPanel'
import SeriesRankingPanel from './SeriesRankingPanel'
import baseStyles from './competition.module.css'
import controlStyles from './CompetitionControl.module.css'
import hubStyles from './CompetitionHubRefinement.module.css'

const styles = { ...baseStyles, ...controlStyles }

type Season = { id: string; name: string; status: string }
type ApiError = { error?: string; setupRequired?: boolean }
type Feedback = { tone:'error'|'warning'|'success'; title:string; message:string }
type Screen = { kind: 'list' } | { kind: 'new' } | { kind: 'detail'; seriesId: string }

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', CLOSED: 'Finalizado',
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
    <div className={styles.heroTop}>{back ? <ClubBackLink href={back} label="Volver a Competencia" /> : null}<span>COMPETENCIAS</span></div>
    <div className={styles.heading}><div><h1>{title}</h1><p>{detail}</p></div>{action}</div>
  </header>
}

const pointsRuleLabels: Record<string, string> = {
  CHAMPION: 'Campeón', RUNNER_UP: 'Subcampeón', SEMIFINALIST: 'Semifinalista', QUARTERFINALIST: 'Cuartofinalista',
  EIGHTH_FINALIST: 'Octavos', SIXTEENTH_FINALIST: 'Dieciseisavos', ROUND_OF_16: 'Octavos de final', PARTICIPATION: 'Participación', WIN: 'Victoria', LOSS: 'Derrota',
}

function pointsRuleLabel(key: string) {
  return pointsRuleLabels[key] ?? key.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function schemeSourceLabel(source: 'EVENT_DRAFT'|'EVENT_SNAPSHOT'|'SETTLEMENT_SNAPSHOT') {
  if (source === 'SETTLEMENT_SNAPSHOT') return 'Liquidación publicada'
  if (source === 'EVENT_SNAPSHOT') return 'Snapshot de la fecha'
  return 'Configuración de la fecha'
}

function seriesOperationalLine(item: CompetitionSeries) {
  const dates = item.planned_events_count ?? 0
  if (item.status === 'CLOSED') return 'Circuito finalizado.'
  if (!dates) return 'Próximo paso: agregá la primera fecha.'
  return dates === 1 ? '1 fecha programada.' : `${dates} fechas planificadas.`
}

function seriesProgressLine(item: CompetitionSeries, events: CompetitionSeriesEvent[]) {
  const focus = selectCompetitionFocusEvent(events)
  const state = focus ? deriveCompetitionEventOperationalState(focus) : null
  if (state?.key === 'TOURNAMENT_FINISHED') return 'Pendiente homologación'
  if (state?.key === 'HOMOLOGATED') return 'Pendiente publicar puntos'
  if (state?.key === 'SETTLED') return 'Ranking actualizado'
  if (state) return state.label
  return seriesOperationalLine(item)
}

function formatEventSportDate(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = startValue?.slice(0, 10) ?? null
  const end = endValue?.slice(0, 10) ?? start
  return start ? formatCompetitionDateRange(start, end) : 'Pendiente'
}

export default function CompetitionAdmin({ screen, mode = 'hub' }: { screen: Screen; mode?: 'hub' | 'circuits' }) {
  const searchParams = useSearchParams()
  const { activeClub, clubRole } = useSession()
  const clubId = activeClub?.id
  const [series, setSeries] = useState<CompetitionSeries[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [detail, setDetail] = useState<CompetitionSeriesDetail | null>(null)
  const [events, setEvents] = useState<CompetitionSeriesEvent[]>([])
  const [seriesEvents, setSeriesEvents] = useState<Record<string, CompetitionSeriesEvent[]>>({})
  const [detailTab, setDetailTab] = useState<'general' | 'dates' | 'ranking' | 'points' | 'rules'>('general')
  const [showRuleEditor, setShowRuleEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<(Error & { status?: number; setupRequired?: boolean }) | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    if (screen.kind !== 'detail') return
    let nextTab: typeof detailTab | null = searchParams.get('event') ? 'dates' : null
    const requestedTab = searchParams.get('tab')
    if (requestedTab === 'general' || requestedTab === 'dates' || requestedTab === 'ranking' || requestedTab === 'points' || requestedTab === 'rules') {
      nextTab = requestedTab
    }
    if (!nextTab) return
    const timer = window.setTimeout(() => setDetailTab(nextTab as typeof detailTab), 0)
    return () => window.clearTimeout(timer)
  }, [screen.kind, searchParams])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!clubId) return
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      if (screen.kind === 'list') {
        const [{ series: items }, seasonResult] = await Promise.all([
          api<{ series: CompetitionSeries[] }>(`/api/clubs/${clubId}/competition/series`),
          supabase.from('competition_seasons').select('id,name,status').eq('club_id', clubId).order('starts_on', { ascending: false }),
        ])
        if (seasonResult.error) throw new Error('No pudimos leer las temporadas del club.')
        setSeries(items); setSeasons((seasonResult.data ?? []) as Season[])
        if (mode === 'circuits') {
          const eventEntries = await Promise.all(items.map(async (item) => {
            const result = await api<{ events: CompetitionSeriesEvent[] }>(`/api/clubs/${clubId}/competition/series/${item.id}/events`)
            return [item.id, result.events] as const
          }))
          setSeriesEvents(Object.fromEntries(eventEntries))
        }
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
    finally { if (!options?.silent) setLoading(false) }
  }, [clubId, mode, screen])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const counts = useMemo(() => ({ active: series.filter((item) => item.status === 'ACTIVE').length, draft: series.filter((item) => item.status === 'DRAFT').length }), [series])
  const featuredSeries = series.find((item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED')
  const remainingSeries = featuredSeries ? series.filter((item) => item.id !== featuredSeries.id) : series
  const canCreateTournament = hasAnyClubPermission(clubRole, ['tournaments:create'])
  const canCreateCircuit = hasAnyClubPermission(clubRole, ['competition:manage'])

  if (!clubId) return <div className={styles.page}><div className={styles.state}>Seleccioná un club para continuar.</div></div>
  if (loading) return <div className={styles.page}><div className={styles.skeleton} /><div className={styles.skeletonList}>{[1, 2, 3].map((item) => <i key={item} />)}</div></div>
  if (error) return <div className={styles.page}><ErrorState error={error} retry={() => void load()} /></div>

  if (screen.kind === 'new') return <SeriesCreateWizard clubId={clubId} request={api} />

  if (screen.kind === 'detail' && detail) {
    const item = detail.series
    const base = `/api/clubs/${clubId}/competition/series/${item.id}`
    const hasEvents = events.length > 0
    const seasonName = seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada del circuito'
    const focusEvent = selectCompetitionFocusEvent(events)
    const focusState = focusEvent ? deriveCompetitionEventPipelineState(focusEvent) : null
    const focusAction = focusEvent ? deriveCompetitionEventNextAction(focusEvent) : null
    const nextEvent = selectNextCompetitionEvent(events)
    const nextEventDate = nextEvent ? formatEventSportDate(nextEvent.tournament_starts_at ?? nextEvent.planned_starts_at, nextEvent.tournament_ends_at ?? nextEvent.planned_ends_at) : 'Sin programar'
    const completed = events.filter((event) => event.status === 'COMPLETED').length
    const publishedEvents = events.filter((event) => deriveCompetitionEventPipelineState(event)?.key === 'SETTLED')
    const firstDivision = detail.divisions.find((division) => division.is_active)
    const snapshot = firstDivision?.division_snapshot
    const activeRule = firstDivision?.rules.find((rule) => rule.status === 'ACTIVE')
    const sportSummary = snapshot
      ? [snapshot.branch_name, snapshot.segment_name, snapshot.category_name, activeRule?.eligibility?.age_category?.name].filter((value) => typeof value === 'string').join(' · ')
      : [firstDivision?.division?.branch?.name, firstDivision?.division?.segment?.name, firstDivision?.division?.category?.name, activeRule?.eligibility?.age_category?.name].filter(Boolean).join(' · ')
    const activeDivisions = detail.divisions.filter((division) => division.is_active)
    const configurationIssue = activeDivisions.length === 0
      ? 'Agregá al menos una división activa.'
      : activeDivisions.map((division) => {
          const rule = division.rules.find((candidate) => candidate.status === 'ACTIVE')
          const eligibility = rule?.eligibility
          const segment = division.division?.segment?.slug
          const branch = division.division?.branch?.slug
          const legacyCategory = division.division?.category?.legacy_category_id
          if (!rule || !eligibility) return 'Completá la regla y elegibilidad de cada división.'
          if (!['caballeros', 'damas', 'mixto'].includes(branch ?? '') || !['libres', 'menores', 'veteranos'].includes(segment ?? '')) return 'La división del circuito no es compatible con una fecha.'
          if (segment === 'libres' && (eligibility.age_category_id || !legacyCategory || legacyCategory < 1 || legacyCategory > 8)) return 'En una división Libres, la categoría de edad debe quedar vacía.'
          if ((segment === 'menores' || segment === 'veteranos') && !eligibility.age_category_id) return 'Menores y Veteranos requieren una categoría de edad compatible.'
          return null
        }).find(Boolean) ?? null
    const canSchedule = item.status === 'DRAFT' && !configurationIssue
    const canActivate = item.status === 'SCHEDULED' && hasEvents && !configurationIssue
    const canAddDate = (item.status === 'SCHEDULED' || item.status === 'ACTIVE') && !configurationIssue
    const primaryHref = canAddDate ? `/club/torneos/nuevo?competitionSeriesId=${item.id}&competitionSeasonId=${item.season_id}` : null
    const eventOperationsHref = focusEvent ? `/club/competition/series/${item.id}/events/${focusEvent.id}` : null
    const homologationHref = focusEvent?.circuit_context ? `${eventOperationsHref}/divisions/${focusEvent.circuit_context.event_division_id}/homologation` : eventOperationsHref
    const nextEventHref = nextEvent ? `/club/competition/series/${item.id}/events/${nextEvent.id}` : null
    const pipelineAction = focusState?.key === 'SPORTS_COMPLETE' && focusEvent?.tournament_id
      ? { href: `/club/torneos/${focusEvent.tournament_id}`, label: 'Finalizar torneo' }
      : focusAction && eventOperationsHref && focusAction.key === 'CLOSE_DATE'
        ? { href: eventOperationsHref, label: focusAction.label }
        : focusAction && homologationHref && ['REVIEW_RESULTS', 'APPROVE_RESULTS', 'PUBLISH_POINTS'].includes(focusAction.key)
          ? { href: homologationHref, label: focusAction.label }
          : focusState?.key === 'SETTLED'
            ? { href: nextEventHref ?? primaryHref, label: 'Gestionar próxima fecha' }
            : null
    const primaryActionHref = pipelineAction?.href ?? nextEventHref ?? primaryHref
    const primaryActionLabel = pipelineAction?.label ?? (nextEventHref ? 'Gestionar próxima fecha' : hasEvents ? 'Agregar fecha' : 'Agregar primera fecha')
    const effectiveScheme = focusEvent?.circuit_context?.points_scheme ?? [...events].reverse().find((event) => event.circuit_context?.points_scheme)?.circuit_context?.points_scheme ?? null
    const plannedLabel = item.planned_events_count ? `${item.planned_events_count} ${item.planned_events_count === 1 ? 'fecha prevista' : 'fechas previstas'}` : 'Fechas por definir'
    const canDelete = item.status === 'DRAFT' && !item.archived_at && !hasEvents
    const isFinalized = item.status === 'CLOSED'
    const canFinalize = item.status === 'ACTIVE' && detail.finalization.can_finalize
    const finalizationBlocker = detail.finalization.blockers[0]?.message ?? null
    const champions = detail.finalRanking.filter((row) => row.ranking_position === 1)
    const pairChampions = detail.finalPairRanking.filter((row) => row.ranking_position === 1)
    const scheduleSeries = async () => {
      if (!canSchedule) { setDetailTab('rules'); return }
      setScheduling(true)
      try {
        await api(`${base}/lifecycle`, { method:'POST', body:JSON.stringify({ action:'SCHEDULE', revision:item.revision }) })
        setFeedback({tone:'success',title:'Circuito programado',message:'Ya podés crear la primera fecha.'})
        await load()
      } catch (cause) { setFeedback({tone:'error',title:'No pudimos programar el circuito',message:cause instanceof Error?cause.message:'Revisá las reglas y la elegibilidad.'}) }
      finally { setScheduling(false) }
    }
    const activateSeries = async () => {
      if (!canActivate) return
      setScheduling(true)
      try {
        await api(`${base}/lifecycle`, { method:'POST', body:JSON.stringify({ action:'ACTIVATE', revision:item.revision, confirm:true }) })
        setFeedback({tone:'success',title:'Circuito activado',message:'Ya podés programar sus fechas y operar los torneos vinculados.'})
        await load()
      } catch (cause) { setFeedback({tone:'error',title:'No pudimos activar el circuito',message:cause instanceof Error?cause.message:'Revisá la configuración y las fechas.'}) }
      finally { setScheduling(false) }
    }
    const deleteSeries = async () => {
      if (deleteConfirmation.trim() !== 'ACEPTAR') return
      setDeleting(true)
      try {
        await api(`/api/clubs/${clubId}/competition/series/${item.id}`, { method:'DELETE', body:JSON.stringify({ revision:item.revision, confirmation:deleteConfirmation }) })
        setFeedback({tone:'success',title:'Circuito eliminado',message:'El circuito se eliminó definitivamente.'})
        window.setTimeout(() => window.location.assign('/club/competition'), 500)
      } catch (cause) { setFeedback({tone:'error',title:'No pudimos eliminar el circuito',message:cause instanceof Error?cause.message:'Intentá nuevamente.'}) }
      finally { setDeleting(false); setDeleteOpen(false); setDeleteConfirmation('') }
    }
    const finalizeSeries = async () => {
      if (!canFinalize) return
      setFinalizing(true)
      try {
        await api(`${base}/lifecycle`, { method:'POST', body:JSON.stringify({ action:'CLOSE', revision:item.revision }) })
        setFeedback({tone:'success',title:'Circuito finalizado',message:'El ranking final y sus campeones quedaron confirmados.'})
        setFinalizeOpen(false)
        setDetailTab('general')
        await load()
      } catch (cause) {
        setFeedback({tone:'error',title:'No pudimos finalizar el circuito',message:cause instanceof Error?cause.message:'Revisá las fechas y publicaciones pendientes.'})
      } finally { setFinalizing(false) }
    }
    return <div className={styles.page}>
      {feedback ? <ActionFeedbackNotice tone={feedback.tone} title={feedback.title} message={feedback.message} onDismiss={() => setFeedback(null)} /> : null}
      <section className={styles.controlHero}>
        <ClubBackLink href="/club/competition/circuits" label="Volver a Circuitos" className={styles.controlBack} />
        <span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>
        <small>CENTRO DE CONTROL</small><h1>{item.name}</h1><p>{[seasonName, sportSummary].filter(Boolean).join(' · ')}</p><em>{plannedLabel}</em>
        {isFinalized ? <button className={styles.controlPrimary} type="button" onClick={() => setDetailTab('ranking')}>Ver ranking final</button> : canFinalize ? <button className={styles.controlPrimary} type="button" onClick={() => setFinalizeOpen(true)}>Finalizar circuito</button> : canActivate ? <button className={styles.controlPrimary} type="button" disabled={scheduling} onClick={() => void activateSeries()}>{scheduling ? 'Activando…' : 'Activar circuito'}</button> : primaryActionHref ? <Link className={styles.controlPrimary} href={primaryActionHref}>{primaryActionLabel}</Link> : canSchedule ? <button className={styles.controlPrimary} type="button" disabled={scheduling} onClick={() => void scheduleSeries()}>{scheduling ? 'Programando…' : 'Programar circuito'}</button> : <button className={styles.controlPrimary} type="button" onClick={() => setDetailTab('rules')}>Completar configuración</button>}
      </section>
      <section className={styles.controlStrip}><div><small>Fechas</small><strong>{item.planned_events_count ? `${events.length}/${item.planned_events_count}` : events.length || '—'}</strong></div><div><small>Próxima</small><strong>{nextEventDate}</strong></div><div><small>Ranking</small><strong>{publishedEvents.length ? 'Actualizado' : focusState ? 'Pendiente' : 'Sin puntos'}</strong></div></section>
      <nav className={styles.controlTabs} aria-label="Centro del circuito">{([['general','General'],['dates','Fechas'],['ranking','Ranking'],['points','Puntos'],['rules','Reglas']] as const).map(([key,label]) => <button className={detailTab === key ? styles.controlTabActive : ''} type="button" onClick={() => setDetailTab(key)} key={key}>{label}</button>)}</nav>
      {detailTab === 'general' ? <>
        <section className={styles.nextStep}><small>{isFinalized ? 'CIERRE CONFIRMADO' : 'PRÓXIMO PASO'}</small><h2>{isFinalized ? 'El circuito está finalizado.' : canFinalize ? 'Todo listo para finalizar el circuito.' : focusState?.key === 'SPORTS_COMPLETE' ? `${focusEvent?.name} terminó deportivamente.` : focusState?.key === 'TOURNAMENT_FINISHED' ? `${focusEvent?.name} finalizado.` : focusState?.key === 'RESULTS_HOMOLOGATED' ? 'Resultados homologados.' : focusState?.key === 'SETTLED' ? `${focusEvent?.name} liquidado.` : canActivate ? 'Activá el circuito para operar la primera fecha.' : !hasEvents ? (canAddDate ? 'Agregá la primera fecha.' : canSchedule ? 'Todo listo para programar.' : 'Terminá la configuración del circuito.') : nextEvent ? `Prepará ${nextEvent.name}.` : 'Próxima fecha sin programar.'}</h2><p>{isFinalized ? 'El ranking final y los campeones quedaron protegidos.' : canFinalize ? 'Confirmá el cierre cuando ya no queden resultados ni puntos pendientes.' : focusState?.key === 'SPORTS_COMPLETE' ? 'Falta finalizar formalmente el torneo.' : focusState?.key === 'TOURNAMENT_FINISHED' ? 'Cerrá la fecha para detectar y revisar sus resultados.' : focusState?.key === 'RESULTS_HOMOLOGATED' ? 'Revisá la distribución y publicá los puntos.' : focusState?.key === 'SETTLED' ? (finalizationBlocker ?? `Los puntos ya fueron incorporados al ranking.${nextEvent ? '' : ' La próxima fecha todavía no está programada.'}`) : finalizationBlocker ?? configurationIssue ?? (!hasEvents ? 'Cada fecha se crea como un torneo real y conserva las reglas del circuito.' : `${completed} ${completed === 1 ? 'fecha disputada' : 'fechas disputadas'} hasta ahora.`)}</p>{isFinalized ? <button type="button" onClick={() => setDetailTab('ranking')}>Ver ranking final →</button> : canFinalize ? <button type="button" onClick={() => setFinalizeOpen(true)}>Finalizar circuito →</button> : canActivate ? <button type="button" disabled={scheduling} onClick={() => void activateSeries()}>{scheduling ? 'Activando…' : 'Activar circuito →'}</button> : primaryActionHref ? <Link href={primaryActionHref}>{primaryActionLabel} →</Link> : canSchedule ? <button type="button" disabled={scheduling} onClick={() => void scheduleSeries()}>{scheduling ? 'Programando…' : 'Programar circuito →'}</button> : <button type="button" onClick={() => setDetailTab('rules')}>Completar configuración →</button>}</section>
        {isFinalized && (champions.length || pairChampions.length) ? <section className={styles.champions}><small>CAMPEONES</small>{champions.map((champion) => <article key={champion.id}><Trophy size={18}/><div><strong>{champion.display_name}</strong><span>{champion.points.toLocaleString('es-AR')} puntos · {champion.titles} {champion.titles === 1 ? 'título' : 'títulos'}</span></div></article>)}{pairChampions.map((champion) => <article key={champion.id}><Trophy size={18}/><div><strong>{champion.player1_name} / {champion.player2_name}</strong><span>Pareja · {champion.points.toLocaleString('es-AR')} puntos · {champion.titles} {champion.titles === 1 ? 'título' : 'títulos'}</span></div></article>)}</section> : null}
        <section className={styles.compactDates}><small>FECHAS DEL CIRCUITO</small><div>{events.map((event, index) => { const state = deriveCompetitionEventOperationalState(event); return <Link key={event.id} href={`/club/competition/series/${item.id}/events/${event.id}`} className={styles.compactDateRow}><b>{index + 1}</b><span><strong>{event.name}</strong><small>{formatEventSportDate(event.tournament_starts_at ?? event.planned_starts_at, event.tournament_ends_at ?? event.planned_ends_at)}</small></span><em className={styles[`tone_${state.tone}`]}>{state.label}</em><ChevronRight size={16}/></Link> })}{Array.from({ length: Math.max(0, (item.planned_events_count ?? 0) - events.length) }, (_, index) => <div className={`${styles.compactDateRow} ${styles.compactDatePlaceholder}`} key={`pending-${index}`}><b>{events.length + index + 1}</b><span><strong>Fecha sin programar</strong><small>Sin fecha</small></span><em>Sin programar</em></div>)}</div></section>
        <section className={styles.controlFacts}><div><small>Temporada</small><strong>{seasonName}</strong></div><div><small>Período</small><strong>{formatCompetitionDateRange(item.starts_on, item.ends_on)}</strong></div><div><small>Formato</small><strong>{activeRule?.accumulation_mode === 'BEST_N' ? `Mejores ${activeRule.best_results_count}` : 'Todos los resultados'}</strong></div><div><small>Divisiones</small><strong>{detail.divisions.filter((division) => division.is_active).length}</strong></div></section>
      </> : null}
      {detailTab === 'dates' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>AGENDA</span><h2>{hasEvents ? 'Fechas del circuito' : 'Todavía no hay fechas'}</h2><p>{hasEvents ? 'Cada fecha corresponde a un torneo real del circuito.' : 'Agregá el primer torneo para empezar la agenda.'}</p></div>{primaryHref ? <Link className={styles.addDateAction} href={primaryHref}>+ {hasEvents ? 'Agregar fecha' : 'Agregar primera fecha'}</Link> : null}{hasEvents ? <div className={styles.dateList}>{events.map((event, index) => { const state = deriveCompetitionEventOperationalState(event); return <Link key={event.id} href={`/club/competition/series/${item.id}/events/${event.id}`} className={styles.dateRow}><span className={`${styles.operationalBadge} ${styles[`tone_${state.tone}`]}`}>{state.label}</span><small>FECHA {index + 1}</small><strong>{event.name}</strong><p>{formatEventSportDate(event.tournament_starts_at ?? event.planned_starts_at, event.tournament_ends_at ?? event.planned_ends_at)}{event.venue_name ? ` · ${event.venue_name}` : ''}</p><b>Gestionar <ChevronRight size={15} /></b></Link> })}</div> : null}{searchParams.get('event') ? <SeriesEventsAdmin clubId={clubId} series={detail} events={events} request={api} reload={() => load({ silent: true })} hideCreate hideList /> : null}</section> : null}
      {detailTab === 'ranking' ? <SeriesRankingPanel clubId={clubId} seriesId={item.id} request={api} pipelineState={focusState} eventName={focusEvent?.name ?? null} hasPublishedEvent={publishedEvents.length > 0} divisions={detail.divisions.filter(division => division.is_active).map(division => ({ id: division.id, name: String(division.division_snapshot?.division_name ?? division.division_snapshot?.category_name ?? division.division?.category?.name ?? 'División'), modality: division.division?.modality ?? String(division.division_snapshot?.modality ?? '') }))} finalized={isFinalized} /> : null}
      {detailTab === 'points' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>PUNTUACIÓN DEL CIRCUITO</span><h2>{effectiveScheme?.name ?? 'Puntuación pendiente'}</h2><p>{effectiveScheme ? `Regla efectiva: ${schemeSourceLabel(effectiveScheme.source)}.` : 'Completá las reglas para definir cómo suma el circuito.'}</p></div>{effectiveScheme ? <><div className={styles.pointsChips}><span>{activeRule?.accumulation_mode === 'BEST_N' ? `Mejores ${activeRule.best_results_count}` : 'Todos los resultados'}</span><span>x{effectiveScheme.multiplier.toLocaleString('es-AR')}</span></div><div className={styles.pointsRules}><small>TABLA DE PUNTOS</small>{sortCompetitionPointsRules(effectiveScheme.rules).map((rule) => <div key={rule.rule_key}><span>{pointsRuleLabel(rule.rule_key)}</span><strong>{rule.points.toLocaleString('es-AR')} pts</strong></div>)}</div></> : null}<div className={styles.eventPointsStates}><small>ESTADO DE LAS FECHAS</small>{events.map((event) => { const state=deriveCompetitionEventOperationalState(event); return <Link href={`/club/competition/series/${item.id}/events/${event.id}`} key={event.id}><span>{event.name}</span><strong>{state.pointsLabel}</strong><ChevronRight size={15}/></Link> })}</div><Link className={styles.secondaryLink} href="/club/competition/points-schemes">Administrar esquema →</Link><SeriesPrizesPanel clubId={clubId} seriesId={item.id} seriesRevision={item.revision} editable={item.status==='DRAFT'&&!item.archived_at} request={api} reload={load}/></section> : null}
      {detailTab === 'rules' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>CONFIGURACIÓN</span><h2>Reglas del circuito</h2><p>{sportSummary || 'Identidad deportiva pendiente'} · {activeRule ? 'Regla activa' : 'Regla pendiente'}</p></div><button className={styles.secondaryLink} type="button" onClick={() => setShowRuleEditor((value) => !value)}>{showRuleEditor ? 'Ocultar edición' : 'Editar configuración'} →</button>{showRuleEditor ? <SeriesDraftEditor {...{ clubId, detail, events, request: api, reload: load }} /> : null}</section> : null}
      {canDelete ? <section className={controlStyles.seriesDanger}><small>ADMINISTRACIÓN AVANZADA</small><button type="button" onClick={() => setDeleteOpen(true)}>Eliminar circuito <ChevronRight size={16}/></button></section> : null}
      {deleteOpen ? <div className={controlStyles.deleteOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-series-title"><section className={controlStyles.deleteDialog}><h2 id="delete-series-title">¿Eliminar circuito?</h2><p>Esta acción eliminará definitivamente el circuito. No se puede deshacer.</p><label>Escribí <b>ACEPTAR</b> para confirmar<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><footer><button type="button" onClick={() => { setDeleteOpen(false); setDeleteConfirmation('') }}>Cancelar</button><button type="button" disabled={deleteConfirmation.trim() !== 'ACEPTAR' || deleting} onClick={() => void deleteSeries()}>{deleting ? 'Eliminando…' : 'Eliminar circuito'}</button></footer></section></div> : null}
      {finalizeOpen ? <div className={controlStyles.deleteOverlay} role="dialog" aria-modal="true" aria-labelledby="finalize-series-title"><section className={`${controlStyles.deleteDialog} ${controlStyles.finalizeDialog}`}><h2 id="finalize-series-title">¿Finalizar circuito?</h2><p>Se confirmarán el ranking final y los campeones. Los resultados publicados quedarán protegidos y no podrán modificarse.</p><footer><button type="button" disabled={finalizing} onClick={() => setFinalizeOpen(false)}>Volver</button><button type="button" disabled={finalizing} onClick={() => void finalizeSeries()}>{finalizing ? 'Finalizando…' : 'Finalizar circuito'}</button></footer></section></div> : null}
    </div>
  }

  if (mode === 'circuits') {
    const groups = [
      { key: 'active', label: 'Activos', items: series.filter((item) => item.status === 'ACTIVE' || item.status === 'SCHEDULED') },
      { key: 'draft', label: 'Borradores', items: series.filter((item) => item.status === 'DRAFT') },
      { key: 'closed', label: 'Finalizados', items: series.filter((item) => item.status === 'CLOSED' || item.status === 'CANCELLED') },
    ]
    return <div className={styles.page}>
      <Header title="Circuitos" detail="Fechas, puntos y ranking de cada competencia." back="/club/competition" action={canCreateCircuit ? <Link className={styles.headerAction} href="/club/competition/series/new">Crear circuito</Link> : null} />
      {!series.length ? <div className={styles.empty}><Trophy size={26}/><strong>Todavía no hay circuitos</strong><p>Creá el primero para organizar varias fechas bajo un mismo ranking.</p></div> : <div className={styles.circuitGroups}>{groups.filter((group) => group.items.length).map((group) => <section key={group.key}><h2>{group.label}</h2><div>{group.items.map((entry) => { const entryEvents = seriesEvents[entry.id] ?? []; return <Link href={`/club/competition/series/${entry.id}`} className={styles.circuitRow} key={entry.id}><span><strong>{entry.name}</strong><small>{entry.planned_events_count ? `${entryEvents.length}/${entry.planned_events_count} fechas` : `${entryEvents.length} fechas`}</small></span><em>{seriesProgressLine(entry, entryEvents)}</em><ChevronRight size={17}/></Link> })}</div></section>)}</div>}
    </div>
  }

  return <div className={styles.page}>
    <Header title="Competencias" detail="Torneos y circuitos desde un solo lugar." action={<span className={styles.heroCompetitionIcon} aria-hidden="true"><Trophy size={30}/></span>} />
    {canCreateTournament || canCreateCircuit ? <section className={[styles.productList, hubStyles.actionGrid].join(' ')} aria-label="Crear una competencia">
      {canCreateTournament ? <Link className={[styles.productCard, hubStyles.actionCard].join(' ')} href="/club/torneos/nuevo"><span className={[styles.productIcon, hubStyles.actionIcon].join(' ')}><CalendarDays size={21} /></span><div><h2>Crear torneo</h2><p><b>Competencia independiente.</b><br />Inscripciones, cuadros, resultados y campeón.</p></div><ChevronRight size={20} /></Link> : null}
      {canCreateCircuit ? <Link className={[styles.productCard, hubStyles.actionCard].join(' ')} href="/club/competition/series/new"><span className={[styles.productIcon, hubStyles.actionIcon].join(' ')}><Medal size={21} /></span><div><h2>Crear circuito</h2><p><b>Varias fechas.</b><br />Ranking del circuito, tabla de puntos y campeón.</p></div><ChevronRight size={20} /></Link> : null}
    </section> : null}
    <ClubAdminHubNav label="Herramientas de competencia" primaryLabel="Operación" secondaryLabel="Configuración" variant="competition" items={[
      { href:'/club/torneos', label:'Torneos', description:'Agenda y gestión', icon:'tournaments', requiredAnyCapabilities:['tournaments:view'] },
      { href:'/club/torneos/calendario', label:'Calendario', description:'Próximas fechas', icon:'calendar', requiredAnyCapabilities:['tournaments:view'] },
      { href:'/club/competition/circuits', label:'Circuitos', description:'Fechas y ranking', icon:'circuits', requiredAnyCapabilities:['competition:view'] },
      { href:'/club/ranking', label:'Ranking', description:'Posiciones del club', icon:'ranking', requiredAnyCapabilities:['ranking:view'] },
      { href:'/club/competition/divisions', label:'Divisiones', description:'Categorías disponibles', icon:'divisions', group:'secondary', requiredAnyCapabilities:['ranking:manage'] },
      { href:'/club/competition/points-schemes', label:'Tablas de puntos', description:'Puntajes del circuito', icon:'points', group:'secondary', requiredAnyCapabilities:['competition:manage'] },
      { href:'/club/reglamento', label:'Reglamento', description:'Normas del club', icon:'rules', group:'secondary', requiredAnyCapabilities:['club:update','news:manage'] },
    ]} />
    {!series.length ? <div className={styles.empty}><Trophy size={26} /><strong>Tu primer circuito empieza acá</strong><p>Elegí Circuito arriba para definir sus reglas y agregar fechas cuando estés listo.</p></div> : <>
      {featuredSeries ? <section className={styles.featuredSection}><div className={styles.listTitle}><span>CIRCUITO DESTACADO</span></div><Link href={`/club/competition/series/${featuredSeries.id}`} className={styles.featuredCard}><span className={`${styles.badge} ${styles[`status_${featuredSeries.status}`]}`}>{statusLabels[featuredSeries.status]}</span><div className={styles.featuredIdentity}><h2>{featuredSeries.name}</h2><p>{seasons.find((season) => season.id === featuredSeries.season_id)?.name ?? 'Temporada'}</p></div><div className={styles.featuredNext}><CalendarDays size={19}/><div><small>{(featuredSeries.planned_events_count ?? 0) ? 'Progreso' : 'Próximo paso'}</small><strong>{seriesOperationalLine(featuredSeries)}</strong></div><b>{(featuredSeries.planned_events_count ?? 0) ? `${featuredSeries.planned_events_count} fechas` : 'Primera fecha pendiente'}</b></div><div className={styles.featuredCta}><span>Ver detalles</span><ChevronRight size={18}/></div></Link></section> : null}
      {remainingSeries.length ? <section className={styles.seriesSection} id="all-series"><div className={styles.listTitle}><div><span>MIS CIRCUITOS</span><h2>Todos los circuitos</h2></div><a href="#all-series">Ver todos <ChevronRight size={14}/></a></div><div className={styles.seriesList}>{remainingSeries.map((item) => <Link href={`/club/competition/series/${item.id}`} className={styles.seriesCard} key={item.id}><span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span><div><h2>{item.name}</h2><p>{seasons.find((season) => season.id === item.season_id)?.name ?? 'Temporada'} · {(item.planned_events_count ?? 0) ? `${item.planned_events_count} ${item.planned_events_count === 1 ? 'fecha' : 'fechas'}` : 'Sin fechas'}</p></div><ChevronRight size={18}/></Link>)}</div></section> : null}
    </>}
    <section className={styles.competitionSummary}><div><Trophy size={15}/><small>Circuitos creados</small><strong>{series.length}</strong></div><div><Activity size={15}/><small>En actividad</small><strong>{counts.active}</strong></div><div><ListChecks size={15}/><small>Pendientes de configurar</small><strong>{counts.draft}</strong></div></section>
  </div>
}
