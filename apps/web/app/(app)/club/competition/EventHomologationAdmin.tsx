'use client'
import { toast } from '@/lib/toastStore'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CircleAlert, FileCheck2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import ClubBackLink from '@/components/club/ClubBackLink'
import { supabase } from '@/lib/supabaseClient'
import type { Homologation } from '@/features/competition/homologation/competition-homologation.types'
import { ActionFeedbackNotice } from '@/components/ui/ActionFeedbackNotice'
import { approveCompetitionResults, type WorkflowState } from '@/lib/competitionPostTournamentFlow'
import { competitionEventIssueCode, uniqueCompetitionEventIssues } from '@/lib/competitionEventIssues'
import { buildHomologationTeamResults, type HomologationTeamResult } from '@/features/competition/homologation/competition-homologation-review'
import EventSettlementPanel from './EventSettlementPanel'
import styles from './EventHomologationAdmin.module.css'

type Row = Record<string, unknown>
type Detail = { homologation: Homologation; event_division: Row; tournament: Row; participants: Row[]; results: Row[]; team_results?: HomologationTeamResult[]; issues: Row[]; blockers: Row[]; warnings: Row[]; evidence: Row[]; allowed_actions: Record<string, boolean> }
type ApiError = Error & { status?: number }
type ReviewTab = 'participants' | 'results' | 'issues'
const statusLabel: Record<string, string> = { DRAFT: 'Pendiente de aprobación', SUBMITTED: 'En revisión', APPROVED: 'Aprobada', REJECTED: 'Rechazada', SUPERSEDED: 'Reemplazada' }

async function token() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(response.status >= 500 ? 'No pudimos completar la operación.' : body.error || 'No pudimos completar la operación.'), { status: response.status })
  return body
}
function value(row: Row, keys: string[], fallback = 'Sin datos') { for (const key of keys) if (typeof row[key] === 'string' || typeof row[key] === 'number') return String(row[key]); return fallback }
function issueText(row: Row) { return value(row, ['message', 'detail', 'description', 'code'], 'Revisá esta condición.') }
function participantName(row: Row) { const snapshot = row.participant_snapshot as Row | undefined; return value(row, ['display_name', 'pair_name', 'entry_name'], value(snapshot ?? {}, ['display_name', 'pair_name', 'name'], 'Participante')) }
function reviewState(detail: Detail): WorkflowState { return { id: detail.homologation.id, revision: detail.homologation.revision, status: detail.homologation.status, blockers: detail.blockers, allowedActions: detail.allowed_actions, sourceResultsRevision: detail.homologation.source_results_revision } }

export default function EventHomologationAdmin({ seriesId, eventId, eventDivisionId }: { seriesId: string; eventId: string; eventDivisionId: string }) {
  const { activeClub } = useSession()
  const clubId = activeClub?.id
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [notice, setNotice] = useState('')
  const [reason, setReason] = useState('')
  const [confirmingSupersede, setConfirmingSupersede] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [tab, setTab] = useState<ReviewTab>('results')
  const [dismissedBanner, setDismissedBanner] = useState('')
  const [pointsPublished, setPointsPublished] = useState(false)
  const collection = clubId ? `/api/clubs/${clubId}/competition/series/${seriesId}/events/${eventId}/divisions/${eventDivisionId}/homologations` : ''
  const handleSettlementStatus = useCallback((status: string | null) => setPointsPublished(status === 'PUBLISHED'), [])

  const load = useCallback(async (silent = false) => {
    if (!clubId) return null
    if (!silent) setLoading(true)
    setFatal(false); setError(null)
    try {
      const list = await api<{ homologations: Homologation[] }>(collection)
      const next = list.homologations.length ? await api<Detail>(`${collection}/${list.homologations[0].id}`) : null
      setDetail(next)
      return next
    } catch (cause) { setFatal(true); setError(cause as ApiError); return null }
    finally { if (!silent) setLoading(false) }
  }, [clubId, collection])

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = sessionStorage.getItem('selpa:competition-close-feedback')
      if (!raw) return
      sessionStorage.removeItem('selpa:competition-close-feedback')
      try {
        const feedback = JSON.parse(raw) as { eventId?: string; participants?: number; results?: number }
        if (feedback.eventId === eventId) setNotice(`Fecha cerrada|${feedback.participants ?? 0} participantes y ${feedback.results ?? 0} resultados detectados. Revisá los resultados antes de aprobar.`)
      } catch { /* Ignore stale local feedback. */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [eventId])

  async function createDraft() {
    if (busy) return
    setBusy('review'); setError(null)
    try {
      const created = await api<{ homologation: Homologation }>(collection, { method: 'POST', body: JSON.stringify({ notes: 'Preparada desde administración.' }) })
      await api(`${collection}/${created.homologation.id}/extract`, { method: 'POST', headers: { 'If-Match': String(created.homologation.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })
      setTab('results'); await load(true)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'No pudimos preparar los resultados.') }
    finally { setBusy('') }
  }

  async function approveResults() {
    if (!detail || busy) return
    setBusy('approve'); setError(null)
    try {
      const detailUrl = `${collection}/${detail.homologation.id}`
      await approveCompetitionResults({
        get: async () => reviewState(await api<Detail>(detailUrl)),
        extract: async current => { await api(`${detailUrl}/extract`, { method: 'POST', headers: { 'If-Match': String(current.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        submit: async current => { await api(`${detailUrl}/submit`, { method: 'POST', headers: { 'If-Match': String(current.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        approve: async current => { await api(`${detailUrl}/approve`, { method: 'POST', headers: { 'If-Match': String(current.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
      })
      setNotice('Resultados homologados|Revisá la distribución de puntos antes de publicarla.')
      await load(true)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'No pudimos aprobar los resultados.'); const current = await load(true); if (current?.blockers.length) setTab('issues') }
    finally { setBusy('') }
  }

  async function prepareResults() {
    if (!detail || busy) return
    setTab('results')
    if (detail.homologation.source_results_revision) return
    setBusy('review'); setError(null)
    try {
      await api(`${collection}/${detail.homologation.id}/extract`, { method: 'POST', headers: { 'If-Match': String(detail.homologation.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })
      await load(true)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'No pudimos preparar los resultados.'); setTab('issues') }
    finally { setBusy('') }
  }

  async function advancedCommand(operation: 'correction' | 'supersede') {
    if (!detail || busy) return
    if (operation === 'supersede' && !reason.trim()) {
      setError(Object.assign(new Error('Ingresá un motivo para reemplazar esta homologación.'), { status: 400 }))
      return
    }
    setBusy(operation); setError(null)
    try {
      await api(`${collection}/${detail.homologation.id}/${operation}`, { method: 'POST', headers: { 'If-Match': String(detail.homologation.revision), 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(operation === 'supersede' ? { reason } : { notes: reason || null }) })
      setReason(''); setConfirmingSupersede(false)
      setNotice(operation === 'correction' ? 'Corrección preparada|La homologación aprobada conserva su historial. Revisá la nueva versión antes de aprobar.' : 'Homologación reemplazada|El historial quedó conservado para auditoría.')
      await load(true)
    } catch (cause) { const next = cause as ApiError; toast.error(next.message); if (next.status === 412) await load(true) }
    finally { setBusy('') }
  }

  const reviewIssues = useMemo(() => {
    if (!detail) return []
    const blockerCodes = new Set(detail.blockers.map(competitionEventIssueCode))
    return uniqueCompetitionEventIssues([...detail.blockers, ...detail.warnings, ...detail.issues]).map(item => ({
      kind: blockerCodes.has(competitionEventIssueCode(item)) || String((item as Row).severity ?? '').toUpperCase() === 'BLOCKER' ? 'blocker' : 'warning',
      item: item as Row,
    }))
  }, [detail])
  const back = `/club/competition/series/${seriesId}/events/${eventId}`
  if (!clubId) return <main className={styles.page}><div className={styles.state}>Seleccioná un club.</div></main>
  if (loading) return <main className={styles.page}><div className={styles.skeleton}><LoaderCircle />Cargando homologación…</div></main>
  if (error && fatal && !detail) { const message = error.status === 401 ? 'Volvé a iniciar sesión.' : error.status === 403 ? 'Tu rol no puede acceder a la homologación.' : error.status === 404 ? 'La división ya no existe.' : error.status === 409 ? 'El estado actual no permite esta operación.' : error.status === 412 ? 'La revisión cambió. Recargamos los datos.' : error.message; return <main className={styles.page}><div className={styles.state}><CircleAlert /><strong>No pudimos abrir la homologación</strong><p>{message}</p><button type="button" onClick={() => void load()}><RefreshCw size={16} />Reintentar</button></div></main> }
  if (!detail) return <main className={styles.page}><ClubBackLink href={back} label="Volver a la fecha" /><header className={styles.hero}><div><span>HOMOLOGACIÓN</span><h1>Revisar resultados</h1><p>Detectá participantes y posiciones del torneo vinculado.</p></div></header>{error ? <p className={styles.error}><AlertCircle size={15} />{error.status === 409 ? 'Primero cerrá la fecha desde Operación de fecha.' : error.message}</p> : null}<div className={styles.empty}><FileCheck2 /><strong>Resultados todavía no detectados</strong><p>SELPA preparará la revisión usando el torneo vinculado.</p><button type="button" disabled={Boolean(busy)} onClick={() => void createDraft()}>{busy ? 'Preparando…' : 'Revisar resultados'}</button></div></main>

  const h = detail.homologation
  const extracted = Boolean(h.source_results_revision)
  const blockerCount = uniqueCompetitionEventIssues(detail.blockers).length
  const teamResults = detail.team_results ?? buildHomologationTeamResults(detail.participants, detail.results)
  const bannerKey = `${h.status}:${extracted}`
  const banner = h.status === 'APPROVED'
    ? { title: 'Resultados homologados', message: 'Ya podés calcular los puntos.' }
    : h.status === 'SUBMITTED'
      ? { title: 'Resultados en revisión', message: detail.blockers.length ? 'Hay problemas que deben corregirse antes de aprobar.' : 'Todo está listo para aprobar.' }
      : extracted
        ? { title: 'Resultados preparados', message: detail.blockers.length ? 'Revisá las incidencias antes de aprobar.' : 'Revisá participantes y posiciones.' }
        : { title: 'Resultados detectados', message: 'Prepará la revisión de participantes y posiciones.' }
  const chooseTab = (next: ReviewTab) => setTab(next)
  const primary = h.status === 'DRAFT' && !extracted
    ? { label: busy === 'review' ? 'Preparando…' : 'Revisar resultados', action: () => void prepareResults() }
    : h.status === 'DRAFT' && blockerCount > 0
      ? { label: 'Revisar incidencias', action: () => setTab('issues') }
      : h.status === 'DRAFT' && extracted && blockerCount === 0 && detail.allowed_actions.submit
        ? { label: busy === 'approve' ? 'Aprobando…' : 'Aprobar resultados', action: () => void approveResults() }
        : null

  return <main className={styles.page}>
    <ClubBackLink href={back} label="Volver a la fecha" />
    <div className={styles.reviewHeader}><header className={styles.hero}><div className={styles.heroTop}><span>HOMOLOGACIÓN</span><b className={`${styles.badge} ${styles[`status_${h.status}`]}`}>{statusLabel[h.status]}</b></div><div className={styles.heading}><div><h1>{value(detail.tournament, ['name'], 'Torneo')}</h1><p>{detail.participants.length} participantes · {teamResults.length} resultados · {blockerCount} problemas</p></div><ShieldCheck size={24} /></div></header>
      <nav className={styles.reviewTabs} aria-label="Revisión de homologación">
        <button type="button" className={tab === 'participants' ? styles.activeTab : ''} onClick={() => chooseTab('participants')}>Participantes <span>{detail.participants.length}</span></button>
        <button type="button" className={tab === 'results' ? styles.activeTab : ''} onClick={() => chooseTab('results')}>Resultados <span>{teamResults.length}</span></button>
        <button type="button" className={tab === 'issues' ? styles.activeTab : ''} onClick={() => chooseTab('issues')}>Incidencias <span>{reviewIssues.length}</span></button>
      </nav>
    </div>
    {error && !fatal ? <p className={styles.error}><AlertCircle size={15} />{error.status === 412 ? 'Los datos cambiaron. Recargá y volvé a revisar.' : error.message}</p> : null}
    {notice ? <ActionFeedbackNotice tone="success" title={notice.split('|')[0]} message={notice.split('|')[1] ?? ''} onDismiss={() => setNotice('')} /> : null}
    {!pointsPublished && dismissedBanner !== bannerKey ? <section className={styles.statusBanner}><div><strong>{banner.title}</strong><p>{banner.message}</p></div><button type="button" aria-label="Cerrar aviso" onClick={() => setDismissedBanner(bannerKey)}><X size={16} /></button></section> : null}

    {tab === 'participants' ? <section className={styles.reviewPanel}><h2>Participantes detectados</h2><div className={styles.rows}>{!detail.participants.length ? <p className={styles.muted}>Todavía no se detectaron participantes.</p> : detail.participants.map((row, index) => <article key={value(row, ['id'], String(index))}><div><strong>{participantName(row)}</strong><small>{value(row, ['entry_type', 'participant_type'], 'Entry')} · {row.is_eligible === false ? 'No elegible' : 'Elegible'}</small></div><span className={styles.chip}>{value(row, ['status'], row.is_eligible === false ? 'Revisar' : 'OK')}</span></article>)}</div></section> : null}
    {tab === 'results' ? <section className={styles.reviewPanel}><h2>Posiciones</h2><div className={styles.results}>{!teamResults.length ? <p className={styles.muted}>Todavía no hay posiciones preparadas.</p> : teamResults.map(team => <div key={team.tournamentTeamId}><span><strong>{team.pairName}</strong></span><b>{team.resultLabel}</b></div>)}</div></section> : null}
    {tab === 'issues' ? <section className={styles.reviewPanel}><h2>Incidencias</h2><div className={styles.preflight}>{!reviewIssues.length ? <p className={styles.ok}><Check size={15} />Sin bloqueos ni advertencias.</p> : reviewIssues.map(({ kind, item }) => <p className={kind === 'blocker' ? styles.blocker : styles.warning} key={`${kind}-${competitionEventIssueCode(item)}`}>{kind === 'blocker' ? <X size={15} /> : <AlertCircle size={15} />}{issueText(item)}</p>)}</div></section> : null}

    <details className={styles.section}><summary>Evidencia <span>{detail.evidence.length}</span></summary><div className={styles.evidence}>{!detail.evidence.length ? <p className={styles.muted}>No hay archivos o enlaces adjuntos.</p> : detail.evidence.map((row, index) => <a href={value(row, ['external_url'], '#')} key={value(row, ['id'], String(index))} target="_blank" rel="noreferrer"><FileCheck2 size={16} /><span><strong>{value(row, ['description', 'evidence_type'], 'Evidencia')}</strong><small>{value(row, ['uploaded_at'], '')}</small></span></a>)}<button type="button" onClick={() => setEvidenceOpen(true)}>Agregar evidencia</button>{evidenceOpen ? <p className={styles.muted}>El cargador estará disponible cuando exista un uploader reutilizable.</p> : null}</div></details>
    {detail.allowed_actions.correct || detail.allowed_actions.supersede ? <details className={styles.section}><summary>Opciones avanzadas</summary><div className={styles.advanced}>{detail.allowed_actions.correct ? <><p>Si detectaste un resultado incorrecto, creá una nueva versión sin borrar la homologación aprobada.</p><button type="button" disabled={Boolean(busy)} onClick={() => void advancedCommand('correction')}>{busy === 'correction' ? 'Preparando…' : 'Corregir resultados'}</button></> : null}{detail.allowed_actions.supersede ? <details className={styles.diagnostic}><summary>Diagnóstico: reemplazar homologación</summary><p>Usá esta acción sólo para invalidar manualmente la versión actual. Quedará registrada en el historial.</p>{confirmingSupersede ? <><label>Motivo obligatorio<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Explicá por qué se reemplaza" /></label><div className={styles.diagnosticActions}><button type="button" onClick={() => { setConfirmingSupersede(false); setReason('') }}>Cancelar</button><button type="button" disabled={Boolean(busy) || !reason.trim()} onClick={() => void advancedCommand('supersede')}>{busy === 'supersede' ? 'Reemplazando…' : 'Confirmar reemplazo'}</button></div></> : <button type="button" disabled={Boolean(busy)} onClick={() => setConfirmingSupersede(true)}>Continuar</button>}</details> : null}</div></details> : null}

    {h.status === 'APPROVED' ? <EventSettlementPanel clubId={clubId} seriesId={seriesId} eventId={eventId} eventDivisionId={eventDivisionId} onStatusChange={handleSettlementStatus} /> : null}
    {primary ? <div className={styles.stickyAction}><button type="button" disabled={Boolean(busy)} onClick={primary.action}>{primary.label}</button></div> : null}
  </main>
}
