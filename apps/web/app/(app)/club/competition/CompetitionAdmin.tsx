'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, ArrowLeft, CalendarDays, ChevronRight, CircleAlert, ListChecks, Medal, RefreshCw, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import ClubAdminHubNav from '@/components/club/ClubAdminHubNav'
import { hasAnyClubPermission } from '@/lib/clubPermissions'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionSeries, CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import { formatCompetitionDateRange } from '@/features/competition/series/competition-series-date'
import type { CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import SeriesDraftEditor from './SeriesDraftEditor'
import SeriesCreateWizard from './SeriesCreateWizard'
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

function formatEventSportDate(startValue: string | null | undefined, endValue: string | null | undefined) {
  const start = startValue?.slice(0, 10) ?? null
  const end = endValue?.slice(0, 10) ?? start
  return start ? formatCompetitionDateRange(start, end) : 'Pendiente'
}

export default function CompetitionAdmin({ screen }: { screen: Screen }) {
  const { activeClub, clubRole } = useSession()
  const clubId = activeClub?.id
  const [series, setSeries] = useState<CompetitionSeries[]>([])
  const [seasons, setSeasons] = useState<Season[]>([])
  const [detail, setDetail] = useState<CompetitionSeriesDetail | null>(null)
  const [events, setEvents] = useState<CompetitionSeriesEvent[]>([])
  const [detailTab, setDetailTab] = useState<'general' | 'dates' | 'ranking' | 'points' | 'rules'>('general')
  const [showRuleEditor, setShowRuleEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<(Error & { status?: number; setupRequired?: boolean }) | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

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
    const nextEvent = events.find((event) => event.status !== 'COMPLETED' && event.status !== 'CANCELLED')
    const nextEventDate = formatEventSportDate(nextEvent?.tournament_starts_at ?? nextEvent?.planned_starts_at, nextEvent?.tournament_ends_at ?? nextEvent?.planned_ends_at)
    const completed = events.filter((event) => event.status === 'COMPLETED').length
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
    const canAddDate = (item.status === 'SCHEDULED' || item.status === 'ACTIVE') && !configurationIssue
    const primaryHref = canAddDate ? `/club/torneos/nuevo?competitionSeriesId=${item.id}&competitionSeasonId=${item.season_id}` : null
    const nextTournamentHref = nextEvent?.tournament_id ? `/club/torneos/${nextEvent.tournament_id}` : null
    const primaryActionHref = nextTournamentHref ?? primaryHref
    const primaryActionLabel = nextTournamentHref ? 'Gestionar próxima fecha' : hasEvents ? 'Agregar fecha' : 'Agregar primera fecha'
    const plannedLabel = item.planned_events_count ? `${item.planned_events_count} ${item.planned_events_count === 1 ? 'fecha prevista' : 'fechas previstas'}` : 'Fechas por definir'
    const canDelete = item.status === 'DRAFT' && !item.archived_at && !hasEvents
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
    return <div className={styles.page}>
      {feedback ? <ActionFeedbackNotice tone={feedback.tone} title={feedback.title} message={feedback.message} onDismiss={() => setFeedback(null)} /> : null}
      <section className={styles.controlHero}>
        <Link href="/club/competition" className={styles.controlBack}><ArrowLeft size={17} /> Circuitos</Link>
        <span className={`${styles.badge} ${styles[`status_${item.status}`]}`}>{statusLabels[item.status]}</span>
        <small>CENTRO DE CONTROL</small><h1>{item.name}</h1><p>{[seasonName, sportSummary].filter(Boolean).join(' · ')}</p><em>{plannedLabel}</em>
        {primaryActionHref ? <Link className={styles.controlPrimary} href={primaryActionHref}>{nextTournamentHref ? primaryActionLabel : `+ ${primaryActionLabel}`}</Link> : canSchedule ? <button className={styles.controlPrimary} type="button" disabled={scheduling} onClick={() => void scheduleSeries()}>{scheduling ? 'Programando…' : 'Programar circuito'}</button> : <button className={styles.controlPrimary} type="button" onClick={() => setDetailTab('rules')}>Completar configuración</button>}
      </section>
      <section className={styles.controlStrip}><div><small>Fechas</small><strong>{item.planned_events_count ? `${events.length}/${item.planned_events_count}` : events.length || '—'}</strong></div><div><small>Próxima</small><strong>{nextEventDate}</strong></div><div><small>Ranking</small><strong>{completed ? 'Actualizable' : 'Sin resultados'}</strong></div></section>
      <nav className={styles.controlTabs} aria-label="Centro del circuito">{([['general','General'],['dates','Fechas'],['ranking','Ranking'],['points','Puntos'],['rules','Reglas']] as const).map(([key,label]) => <button className={detailTab === key ? styles.controlTabActive : ''} type="button" onClick={() => setDetailTab(key)} key={key}>{label}</button>)}</nav>
      {detailTab === 'general' ? <>
        <section className={styles.nextStep}><small>PRÓXIMO PASO</small><h2>{!hasEvents ? (canAddDate ? 'Agregá la primera fecha.' : canSchedule ? 'Todo listo para programar.' : 'Terminá la configuración del circuito.') : `Prepará ${nextEvent?.name ?? 'la próxima fecha'}.`}</h2><p>{configurationIssue ?? (!hasEvents ? 'Cada fecha se crea como un torneo real y conserva las reglas del circuito.' : `${completed} ${completed === 1 ? 'fecha disputada' : 'fechas disputadas'} hasta ahora.`)}</p>{primaryActionHref ? <Link href={primaryActionHref}>{nextTournamentHref ? 'Gestionar próxima fecha →' : `${hasEvents ? 'Agregar otra fecha' : 'Agregar primera fecha'} →`}</Link> : canSchedule ? <button type="button" disabled={scheduling} onClick={() => void scheduleSeries()}>{scheduling ? 'Programando…' : 'Programar circuito →'}</button> : <button type="button" onClick={() => setDetailTab('rules')}>Completar configuración →</button>}</section>
        <section className={styles.controlFacts}><div><small>Temporada</small><strong>{seasonName}</strong></div><div><small>Período</small><strong>{formatCompetitionDateRange(item.starts_on, item.ends_on)}</strong></div><div><small>Formato</small><strong>{activeRule?.accumulation_mode === 'BEST_N' ? `Mejores ${activeRule.best_results_count}` : 'Todos los resultados'}</strong></div><div><small>Divisiones</small><strong>{detail.divisions.filter((division) => division.is_active).length}</strong></div></section>
      </> : null}
      {detailTab === 'dates' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>AGENDA</span><h2>{hasEvents ? 'Fechas del circuito' : 'Todavía no hay fechas'}</h2><p>{hasEvents ? 'Cada fecha corresponde a un torneo real del circuito.' : 'Agregá el primer torneo para empezar la agenda.'}</p></div>{primaryHref ? <Link className={styles.addDateAction} href={primaryHref}>+ {hasEvents ? 'Agregar fecha' : 'Agregar primera fecha'}</Link> : null}{hasEvents ? <div className={styles.dateList}>{events.map((event, index) => <Link key={event.id} href={event.tournament_id ? `/club/torneos/${event.tournament_id}` : `/club/competition/series/${item.id}/events/${event.id}`} className={styles.dateRow}><span className={`${styles.badge} ${styles[`status_${event.status}`]}`}>{statusLabels[event.status] ?? event.status}</span><small>FECHA {index + 1}</small><strong>{event.name}</strong><p>{formatEventSportDate(event.tournament_starts_at ?? event.planned_starts_at, event.tournament_ends_at ?? event.planned_ends_at)}{event.venue_name ? ` · ${event.venue_name}` : ''}</p><b>{event.tournament_id ? 'Gestionar' : 'Ver fecha'} <ChevronRight size={15} /></b></Link>)}</div> : null}</section> : null}
      {detailTab === 'ranking' ? <SeriesRankingPanel clubId={clubId} seriesId={item.id} request={api} hasCompletedEvent={completed > 0} /> : null}
      {detailTab === 'points' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>TABLA DE PUNTOS</span><h2>{activeRule ? 'Puntuación del circuito' : 'Puntuación pendiente'}</h2><p>{activeRule ? `${activeRule.accumulation_mode === 'BEST_N' ? `Cuentan los mejores ${activeRule.best_results_count} resultados.` : 'Cuentan todos los resultados.'}` : 'Completá las reglas para definir cómo suma el circuito.'}</p></div><Link className={styles.secondaryLink} href="/club/competition/points-schemes">Revisar tabla de puntos →</Link><SeriesPrizesPanel clubId={clubId} seriesId={item.id} seriesRevision={item.revision} editable={item.status==='DRAFT'&&!item.archived_at} request={api} reload={load}/></section> : null}
      {detailTab === 'rules' ? <section className={styles.controlPanel}><div className={styles.sectionHead}><span>CONFIGURACIÓN</span><h2>Reglas del circuito</h2><p>{sportSummary || 'Identidad deportiva pendiente'} · {activeRule ? 'Regla activa' : 'Regla pendiente'}</p></div><button className={styles.secondaryLink} type="button" onClick={() => setShowRuleEditor((value) => !value)}>{showRuleEditor ? 'Ocultar edición' : 'Editar configuración'} →</button>{showRuleEditor ? <SeriesDraftEditor {...{ clubId, detail, events, request: api, reload: load }} /> : null}</section> : null}
      {canDelete ? <section className={controlStyles.seriesDanger}><small>ADMINISTRACIÓN AVANZADA</small><button type="button" onClick={() => setDeleteOpen(true)}>Eliminar circuito <ChevronRight size={16}/></button></section> : null}
      {deleteOpen ? <div className={controlStyles.deleteOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-series-title"><section className={controlStyles.deleteDialog}><h2 id="delete-series-title">¿Eliminar circuito?</h2><p>Esta acción eliminará definitivamente el circuito. No se puede deshacer.</p><label>Escribí <b>ACEPTAR</b> para confirmar<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label><footer><button type="button" onClick={() => { setDeleteOpen(false); setDeleteConfirmation('') }}>Cancelar</button><button type="button" disabled={deleteConfirmation.trim() !== 'ACEPTAR' || deleting} onClick={() => void deleteSeries()}>{deleting ? 'Eliminando…' : 'Eliminar circuito'}</button></footer></section></div> : null}
    </div>
  }

  return <div className={styles.page}>
    <Header title="Competencias" detail="Torneos y circuitos desde un solo lugar." action={<span className={styles.heroCompetitionIcon} aria-hidden="true"><Trophy size={30}/></span>} />
    {canCreateTournament || canCreateCircuit ? <section className={[styles.productList, hubStyles.actionGrid].join(' ')} aria-label="Crear una competencia">
      {canCreateTournament ? <Link className={[styles.productCard, hubStyles.actionCard].join(' ')} href="/club/torneos/nuevo"><span className={[styles.productIcon, hubStyles.actionIcon].join(' ')}><CalendarDays size={21} /></span><div><h2>Crear torneo</h2><p><b>Competencia independiente.</b><br />Inscripciones, cuadros, resultados y campeón.</p></div><ChevronRight size={20} /></Link> : null}
      {canCreateCircuit ? <Link className={[styles.productCard, hubStyles.actionCard].join(' ')} href="/club/competition/series/new"><span className={[styles.productIcon, hubStyles.actionIcon].join(' ')}><Medal size={21} /></span><div><h2>Crear circuito</h2><p><b>Varias fechas.</b><br />Ranking anual, tabla de puntos y campeón del circuito.</p></div><ChevronRight size={20} /></Link> : null}
    </section> : null}
    <ClubAdminHubNav label="Herramientas de competencia" primaryLabel="Operación" secondaryLabel="Configuración" variant="competition" items={[
      { href:'/club/torneos', label:'Torneos', description:'Agenda y gestión', icon:'tournaments', requiredAnyCapabilities:['tournaments:view'] },
      { href:'/club/torneos/calendario', label:'Calendario', description:'Próximas fechas', icon:'calendar', requiredAnyCapabilities:['tournaments:view'] },
      { href:'/club/competition', label:'Circuitos', description:'Fechas y ranking', icon:'circuits', requiredAnyCapabilities:['competition:view'] },
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
