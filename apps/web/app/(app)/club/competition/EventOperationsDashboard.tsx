'use client'

import { toast } from '@/lib/toastStore'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CalendarDays, Check, Circle, MapPin, RefreshCw, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import ClubBackLink from '@/components/club/ClubBackLink'
import { supabase } from '@/lib/supabaseClient'
import { formatTournamentSystemLabel } from '@/lib/tournamentLabels'
import { deriveCompetitionEventOperationalState } from '@/lib/competitionTournamentState'
import type { TournamentConfigurationDetail } from '@/lib/tournamentOperationalConfiguration'
import { getCompetitionConfigurationAction, getCompetitionEventOperationPresentation } from '@/lib/competitionEventOperationPresentation'
import type { CompetitionEventDetail } from '@/features/competition/events/competition-events.types'
import { closeCompetitionEvent, CompetitionEventClosureBlocked, type ClosureHomologation, type ClosureHomologationDetail } from '@/lib/competitionEventClosure'
import { competitionEventIssueCode, competitionEventIssueLabel, isActionableCompetitionEventIssue, uniqueCompetitionEventIssues } from '@/lib/competitionEventIssues'
import styles from './EventOperationsDashboard.module.css'

type EventDetail = CompetitionEventDetail & { allowed_actions: Record<string, boolean> }
type RecordRow = Record<string, unknown>
type CompletionPreflight = { ready: boolean; blockers: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }>; tournament: { id: string; name: string; status: string | null } | null }
type DivisionOps = { homologations: RecordRow[]; settlements: RecordRow[]; preflight: CompletionPreflight | null; configuration: TournamentConfigurationDetail | null }
type ApiError = Error & { status?: number }
const labels: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', COMPLETED: 'Finalizado', CANCELLED: 'Cancelado', CALCULATED: 'Vista previa lista', APPROVED: 'Aprobada', PUBLISHED: 'Publicado', SUBMITTED: 'En revisión' }
const eventTypes: Record<string, string> = { STANDARD: 'Competitivo', EXHIBITION: 'Exhibición', FRIENDLY: 'Amistoso' }

async function accessToken() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(response.status >= 500 ? 'No pudimos completar la operación.' : body.error || 'No pudimos cargar el evento.'), { status: response.status })
  return body
}
function snapshotName(row: RecordRow) {
  const snapshot = row.configuration_snapshot as RecordRow | null
  const division = snapshot?.division as RecordRow | undefined
  return String(division?.division_name ?? division?.division_label ?? snapshot?.division_name ?? `División ${Number(row.sort_order ?? 0) + 1}`)
}
function latest(rows: RecordRow[]) { return rows[0] ?? null }
function status(row: RecordRow | null) { return row ? String(row.status ?? '') : '' }
function homologationStatusLabel(row: RecordRow | null) { return status(row) === 'DRAFT' ? 'Pendiente de aprobación' : labels[status(row)] ?? status(row) }

export default function EventOperationsDashboard({ seriesId, eventId }: { seriesId: string; eventId: string }) {
  const { activeClub } = useSession()
  const router = useRouter()
  const clubId = activeClub?.id
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [operations, setOperations] = useState<Record<string, DivisionOps>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const base = clubId ? `/api/clubs/${clubId}/competition/series/${seriesId}/events/${eventId}` : ''

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true); setError(null)
    try {
      const event = await api<EventDetail>(base)
      const active = event.divisions.filter(item => item.is_active)
      const entries = await Promise.all(active.map(async division => {
        const id = String(division.id)
        const tournamentId=division.active_tournament_link?.tournament_id
        const [homologations, settlements, preflight, configuration] = await Promise.all([
          api<{ homologations: RecordRow[] }>(`${base}/divisions/${id}/homologations`),
          api<{ settlements: RecordRow[] }>(`${base}/divisions/${id}/settlements`),
          api<CompletionPreflight>(`${base}/divisions/${id}/complete`),
          tournamentId?api<TournamentConfigurationDetail>(`/api/clubs/${clubId}/tournaments/${String(tournamentId)}/configuration`).catch(()=>null):Promise.resolve(null),
        ])
        return [id, { homologations: homologations.homologations, settlements: settlements.settlements, preflight, configuration }] as const
      }))
      setDetail(event); setOperations(Object.fromEntries(entries))
    } catch (cause) { setError(cause as ApiError) }
    finally { setLoading(false) }
  }, [base, clubId])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function closeDate() {
    if (!clubId || busy) return
    setBusy('close')
    try {
      const result = await closeCompetitionEvent({
        getEvent: () => api<EventDetail>(base),
        activateSeries: async revision => { await api(`/api/clubs/${clubId}/competition/series/${seriesId}/lifecycle`, { method: 'POST', body: JSON.stringify({ action: 'ACTIVATE', revision, confirm: true }) }) },
        scheduleEvent: async revision => { await api(`${base}/schedule`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        getDivisionPreflight: divisionId => api<CompletionPreflight>(`${base}/divisions/${divisionId}/complete`),
        completeDivision: async (divisionId, revision) => { await api(`${base}/divisions/${divisionId}/complete`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        completeEvent: async revision => { await api(`${base}/complete`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        listHomologations: async divisionId => (await api<{ homologations: ClosureHomologation[] }>(`${base}/divisions/${divisionId}/homologations`)).homologations,
        createHomologation: async divisionId => (await api<{ homologation: ClosureHomologation }>(`${base}/divisions/${divisionId}/homologations`, { method: 'POST', body: JSON.stringify({ notes: 'Generada al cerrar la fecha.' }) })).homologation,
        getHomologation: (divisionId, homologationId) => api<ClosureHomologationDetail>(`${base}/divisions/${divisionId}/homologations/${homologationId}`),
        extractHomologation: async (divisionId, homologationId, revision) => { await api(`${base}/divisions/${divisionId}/homologations/${homologationId}/extract`, { method: 'POST', headers: { 'If-Match': String(revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
      })
      sessionStorage.setItem('selpa:competition-close-feedback', JSON.stringify({ eventId, participants: result.participants, results: result.results }))
      router.push(`/club/competition/series/${seriesId}/events/${eventId}/divisions/${result.eventDivisionId}/homologation`)
    } catch (cause) {
      toast.error(cause instanceof CompetitionEventClosureBlocked ? cause.message : cause instanceof Error ? cause.message : 'No pudimos cerrar la fecha.')
      await load()
    } finally { setBusy(null) }
  }

  const activeDivisions = useMemo(() => detail?.divisions.filter(item => item.is_active) ?? [], [detail])
  const summary = useMemo(() => {
    let linked = 0, ready = 0, pendingHomologations = 0, pendingSettlements = 0, pendingPublications = 0
    for (const division of activeDivisions) {
      const id = String(division.id), ops = operations[id], homologation = latest(ops?.homologations ?? []), settlement = latest(ops?.settlements ?? [])
      if (division.active_tournament_link) linked++
      if (division.scoring_mode && division.rule) ready++
      if (division.active_tournament_link && status(homologation) !== 'APPROVED') pendingHomologations++
      if (status(homologation) === 'APPROVED' && !settlement) pendingSettlements++
      if (settlement && status(settlement) !== 'PUBLISHED') pendingPublications++
    }
    return { linked, ready, pendingHomologations, pendingSettlements, pendingPublications }
  }, [activeDivisions, operations])

  if (!clubId) return <main className={styles.page}><div className={styles.state}>Seleccioná un club para continuar.</div></main>
  if (loading) return <main className={styles.page}><div className={styles.skeleton} /><div className={styles.skeletonRows}>{[1, 2, 3].map(value => <i key={value} />)}</div></main>
  if (error) {
    const message = error.status === 401 ? 'Volvé a iniciar sesión.' : error.status === 403 ? 'Tu rol no tiene acceso a este evento.' : error.status === 404 ? 'La fecha ya no existe.' : error.status === 409 ? 'El evento cambió y no puede abrirse en este estado.' : error.status === 412 ? 'La revisión quedó desactualizada.' : error.message
    return <main className={styles.page}><div className={styles.state}><AlertCircle /><strong>No pudimos abrir la fecha</strong><p>{message}</p><button onClick={() => void load()}><RefreshCw size={16} />Reintentar</button></div></main>
  }
  if (!detail) return null
  const event = detail.event
  const blockerIssues = Array.isArray(detail.completeness.blockers) ? uniqueCompetitionEventIssues(detail.completeness.blockers) : []
  const issues = uniqueCompetitionEventIssues([
    ...blockerIssues,
    ...(Array.isArray(detail.completeness.warnings) ? detail.completeness.warnings : []),
  ]).filter(issue => isActionableCompetitionEventIssue(issue, event))
  const eventEditorHref = `/club/competition/series/${seriesId}?tab=dates&event=${eventId}`
  const automaticPreflightCodes = new Set(['DIVISION_NOT_SCHEDULED', 'EVENT_NOT_SCHEDULED', 'SERIES_NOT_ACTIVE'])
  const canCloseDate = ['DRAFT', 'SCHEDULED'].includes(event.status)
    && ['SCHEDULED', 'ACTIVE'].includes(String(detail.series.status ?? ''))
    && detail.allowed_actions.complete_division
    && activeDivisions.length > 0
    && activeDivisions.every(division => {
      const preflight = operations[String(division.id)]?.preflight
      return Boolean(division.active_tournament_link && preflight?.tournament?.status === 'FINISHED' && preflight.blockers.every(item => automaticPreflightCodes.has(item.code)))
    })
    && blockerIssues.every(issue => automaticPreflightCodes.has(competitionEventIssueCode(issue)))
  const reviewDivision = activeDivisions.find(division => String(division.status) === 'COMPLETED' && !['APPROVED'].includes(status(latest(operations[String(division.id)]?.homologations ?? []))))
  const pointsDivision = activeDivisions.find(division => status(latest(operations[String(division.id)]?.homologations ?? [])) === 'APPROVED' && status(latest(operations[String(division.id)]?.settlements ?? [])) !== 'PUBLISHED')
  const allPublished = activeDivisions.length > 0 && activeDivisions.every(division => status(latest(operations[String(division.id)]?.settlements ?? [])) === 'PUBLISHED')
  const operationalState = deriveCompetitionEventOperationalState({ ...event, circuit_context: { settlement_status: allPublished ? 'PUBLISHED' : null } })
  const hasTournamentCapability=activeDivisions.some(division=>Object.values(operations[String(division.id)]?.configuration?.capabilities??{}).some(capability=>capability.editable))
  const hasCompetitionCapability=Boolean(detail.allowed_actions.edit)&&activeDivisions.some(division=>String(division.status)==='DRAFT'&&(!division.active_tournament_link||operations[String(division.id)]?.configuration?.capabilities.structure.editable))
  const configurationAction=getCompetitionConfigurationAction({hasRequiredIssues:issues.length>0,hasEventCapability:Boolean(detail.allowed_actions.edit),hasTournamentCapability,hasCompetitionCapability})
  const primaryAction = allPublished
    ? <Link className={styles.primary} href={`/club/competition/series/${seriesId}?tab=ranking`}>Ver ranking</Link>
    : pointsDivision
      ? <Link className={styles.primary} href={`/club/competition/series/${seriesId}/events/${eventId}/divisions/${String(pointsDivision.id)}/homologation`}>Publicar puntos</Link>
      : reviewDivision
        ? <Link className={styles.primary} href={`/club/competition/series/${seriesId}/events/${eventId}/divisions/${String(reviewDivision.id)}/homologation`}>Revisar resultados</Link>
        : canCloseDate
          ? <button className={styles.primary} type="button" disabled={busy === 'close'} onClick={() => void closeDate()}>{busy === 'close' ? 'Cerrando…' : 'Cerrar fecha'}</button>
          : null
  const operationPresentation = getCompetitionEventOperationPresentation({
    eventStatus:event.status,operationalState:operationalState.key,canCloseDate,
    divisions:activeDivisions.map(division=>{
      const ops=operations[String(division.id)]
      return {linked:Boolean(division.active_tournament_link),divisionStatus:String(division.status),
        tournamentStatus:typeof division.tournament_status==='string'?division.tournament_status:ops?.preflight?.tournament?.status??null,
        homologationStatus:status(latest(ops?.homologations??[])),settlementStatus:status(latest(ops?.settlements??[])),scoringMode:String(division.scoring_mode??'')}
    }),
  })

  return <main className={styles.page}>
    <ClubBackLink href={`/club/competition/series/${seriesId}?tab=dates`} label="Volver al circuito" />
    <header className={styles.hero}><div className={styles.eyebrow}><span>OPERACIÓN DE FECHA</span><b className={`${styles.badge} ${styles[`status_${operationalState.key === 'OPEN' ? 'SCHEDULED' : event.status}`]} ${operationalState.tone==='success'?styles.badgeSuccess:''}`}>{operationalState.label}</b></div><div className={styles.title}><div><h1>{event.name}</h1><p><CalendarDays size={14} />{event.planned_starts_at ? new Date(event.planned_starts_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}{event.venue_name ? <><MapPin size={14} />{event.venue_name}</> : null}</p></div>{primaryAction}</div><div className={styles.meta}><div className={styles.metaChips}><span>{eventTypes[event.event_type]}</span>{event.tournament_status ? <span>{['OPEN', 'RUNNING', 'FINISHED'].includes(event.tournament_status) ? 'Torneo publicado' : 'Torneo sin publicar'}</span> : <span>{event.is_public ? 'Pública' : 'Privada'}</span>}<span>Rev. {event.revision}</span></div><Link className={styles.secondary} href={eventEditorHref}>{configurationAction.label}</Link></div></header>

    <section className={styles.kpis}><div><strong>{activeDivisions.length}</strong><small>Divisiones</small></div><div><strong>{summary.ready}</strong><small>Listas</small></div><div><strong>{summary.linked}</strong><small>Torneos</small></div></section>
    {issues.length ? <section className={styles.alerts}>{issues.map(item => <p key={competitionEventIssueCode(item) || String(item)}><AlertCircle size={15} />{competitionEventIssueLabel(item)}</p>)}</section> : null}
    <section className={styles.pending}><span><b>{summary.pendingHomologations}</b> revisiones</span><span><b>{summary.pendingSettlements}</b> cierres de puntos</span><span><b>{summary.pendingPublications}</b> publicaciones</span></section>

    <section className={styles.section}><div className={styles.sectionTitle}><div><span>DIVISIONES</span><h2>Operación deportiva</h2></div></div>
      {!activeDivisions.length ? <div className={styles.empty}><Trophy size={22} /><strong>Esta fecha no tiene divisiones</strong><p>Agregalas desde la configuración del circuito.</p>{detail.allowed_actions.edit ? <Link href={`/club/competition/series/${seriesId}`}>Configurar divisiones</Link> : null}</div> : <div className={styles.list}>{activeDivisions.map(division => {
        const id = String(division.id), ops = operations[id] ?? { homologations: [], settlements: [], preflight: null, configuration:null }, homologation = latest(ops.homologations), settlement = latest(ops.settlements), link = division.active_tournament_link, completed = String(division.status) === 'COMPLETED'
        const divisionOperationalState = deriveCompetitionEventOperationalState({ status: String(division.status), tournament_status: typeof division.tournament_status === 'string' ? division.tournament_status : ops.preflight?.tournament?.status, tournament_registration_deadline: typeof division.tournament_registration_deadline === 'string' ? division.tournament_registration_deadline : null, circuit_context: { homologation_status: status(homologation), settlement_status: status(settlement) } })
        const visiblePreflightBlockers = ops.preflight?.blockers.filter(issue => isActionableCompetitionEventIssue(issue, event)) ?? []
        const progress = status(settlement)==='PUBLISHED' ? 'Puntos publicados · Ranking actualizado' : status(homologation)==='APPROVED' ? 'Resultados aprobados' : completed ? 'Resultados listos para revisar' : ops.preflight?.ready ? 'Listo para cerrar' : null
        return <article className={styles.division} key={id}>
          <div className={styles.divisionHead}>
            <div><strong>{snapshotName(division)}</strong><small>
              {division.scoring_mode === 'POINTS' ? 'Con puntos' : division.scoring_mode === 'NON_SCORING' ? 'Sin puntos' : 'Puntuación pendiente'}
              {' · '}{String(division.tier?.name ?? 'Nivel por definir')}
              {' · '}{formatTournamentSystemLabel(typeof division.competition_system === 'string' ? division.competition_system : null)}
            </small></div>
            <span className={`${styles.badge} ${divisionOperationalState.tone==='success'?styles.badgeSuccess:''}`}>{divisionOperationalState.label}</span>
          </div>
          {progress?<p className={`${styles.progress} ${ops.preflight?.ready || completed || status(settlement)==='PUBLISHED' || status(homologation)==='APPROVED' ? styles.progressReady : ''}`}>{progress}</p>:null}
          <dl>
            <div><dt>Regla</dt><dd>{division.rule ? String(division.rule.name ?? 'Del circuito') : 'Sin configurar'}</dd></div>
            <div><dt>Torneo</dt><dd className={link?styles.resolved:undefined}>{link ? 'Vinculado' : 'Sin torneo'}</dd></div>
            <div><dt>Resultados</dt><dd>{homologation ? homologationStatusLabel(homologation) : 'Pendiente'}</dd></div>
            <div><dt>Puntos</dt><dd>{settlement ? labels[status(settlement)] ?? status(settlement) : 'Pendiente'}</dd></div>
          </dl>
          {visiblePreflightBlockers.length ? <div className={styles.preflight}>{visiblePreflightBlockers.map(item => <small key={item.code}><AlertCircle size={13} />{item.message}</small>)}</div> : null}
          {link ? <Link className={styles.tournament} href={`/club/torneos/${String(link.tournament_id)}`}>Gestionar torneo<ArrowRight size={16} aria-hidden="true" /></Link> : null}
        </article>
      })}</div>}
    </section>

    <section className={styles.timeline}><div className={styles.sectionTitle}><div><span>PROGRESO DE LA FECHA</span><h2>Timeline operativo</h2></div></div>
      <div className={`${styles.nextStep} ${operationPresentation.complete?styles.nextStepComplete:''}`}><small>{operationPresentation.complete?'Todo al día':operationPresentation.cancelled?'Operación detenida':'Siguiente paso recomendado'}</small><strong>{operationPresentation.recommendation}</strong></div>
      <ol className={styles.steps}>{operationPresentation.steps.map(step=><li key={step.label} className={step.state==='pending'?styles.stepPending:styles[step.state]} data-state={step.state} aria-current={step.state==='current'?'step':undefined} aria-label={`${step.label}: ${step.state==='done'?'completado':step.state==='current'?'paso actual':'pendiente'}`}>
        <span className={styles.stepIcon}>{step.state==='done'?<Check size={14} aria-hidden="true"/>:step.state==='current'?<ArrowRight size={14} aria-hidden="true"/>:<Circle size={12} aria-hidden="true"/>}</span><span>{step.label}</span>{step.state==='current'?<small>Ahora</small>:null}
      </li>)}</ol>
    </section>
  </main>
}
