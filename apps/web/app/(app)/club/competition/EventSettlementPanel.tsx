'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Coins, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { ActionFeedbackNotice, type ActionFeedbackTone } from '@/components/ui/ActionFeedbackNotice'
import { supabase } from '@/lib/supabaseClient'
import type { Settlement, SettlementDetail } from '@/features/competition/settlement/competition-settlement.types'
import { prepareCompetitionPointsPreview, publishCompetitionPoints, type WorkflowState } from '@/lib/competitionPostTournamentFlow'
import styles from './EventSettlementPanel.module.css'

type SettlementAdminDetail = SettlementDetail & {
  totals: { calculated: number; published: number; awards: number; movements: number }
  allowedActions: Record<string, boolean>
}
type Feedback = { tone: ActionFeedbackTone; title: string; message: string }
type ApiError = Error & { status?: number; code?: string }
type TransitionResponse = { state: WorkflowState }
type RuleCode = 'CHAMPION' | 'RUNNER_UP' | 'SEMIFINALIST' | 'QUARTERFINALIST' | 'EIGHTH_FINALIST' | 'SIXTEENTH_FINALIST' | 'PARTICIPANT'
const labels: Record<string, string> = { DRAFT: 'Preparando', CALCULATED: 'Vista previa', SUBMITTED: 'En revisión', APPROVED: 'Lista para publicar', PUBLISHED: 'Publicada', REJECTED: 'Rechazada', SUPERSEDED: 'Reemplazada' }
const ruleCodes: RuleCode[] = ['CHAMPION', 'RUNNER_UP', 'SEMIFINALIST', 'QUARTERFINALIST', 'EIGHTH_FINALIST', 'SIXTEENTH_FINALIST', 'PARTICIPANT']
const resultLabels: Record<string, string> = { CHAMPION: 'Campeón', RUNNER_UP: 'Subcampeón', SEMIFINALIST: 'Semifinalista', QUARTERFINALIST: 'Cuartofinalista', EIGHTH_FINALIST: 'Octavos', SIXTEENTH_FINALIST: 'Dieciseisavos', ROUND_OF_16: 'Octavos de final', PARTICIPANT: 'Participación', PARTICIPATION: 'Participación' }

async function token() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string }
  if (!response.ok) throw Object.assign(new Error(body.error || 'No pudimos completar la operación.'), { status: response.status, code: body.code })
  return body
}
function issueText(row: Record<string, unknown>) { return String(row.message ?? row.code ?? 'Revisá esta incidencia.') }
function settlementState(detail: SettlementAdminDetail): WorkflowState { return { id: detail.settlement.id, revision: detail.settlement.revision, status: detail.settlement.status, blockers: detail.preflight.blockers, allowedActions: detail.allowedActions } }
function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function rulesFromSnapshot(detail: SettlementAdminDetail) {
  const snapshot = record(detail.settlement.calculation_snapshot)
  const rules = Array.isArray(snapshot.points_rules) ? snapshot.points_rules.map(record) : []
  return Object.fromEntries(ruleCodes.map(code => [code, Number(rules.find(rule => String(rule.rule_key).toUpperCase() === code)?.points ?? 0)])) as Record<RuleCode, number>
}

export default function EventSettlementPanel({ clubId, seriesId, eventId, eventDivisionId, onStatusChange }: { clubId: string; seriesId: string; eventId: string; eventDivisionId: string; onStatusChange?: (status: string | null) => void }) {
  const collection = `/api/clubs/${clubId}/competition/series/${seriesId}/events/${eventId}/divisions/${eventDivisionId}/settlements`
  const [detail, setDetail] = useState<SettlementAdminDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [pointsValidation, setPointsValidation] = useState('')
  const [confirmingCorrection, setConfirmingCorrection] = useState(false)
  const [pointValues, setPointValues] = useState<Record<RuleCode, number>>({ CHAMPION: 0, RUNNER_UP: 0, SEMIFINALIST: 0, QUARTERFINALIST: 0, EIGHTH_FINALIST: 0, SIXTEENTH_FINALIST: 0, PARTICIPANT: 0 })
  const previewBaseline = useRef<WorkflowState | null>(null)

  const getDetail = useCallback(async (settlementId: string) => request<SettlementAdminDetail>(`${collection}/${settlementId}`), [collection])
  const load = useCallback(async (preparePreview = false) => {
    setLoading(true)
    try {
      let latestDetail: SettlementAdminDetail | null = null
      const readLatest = async () => {
        const settlements = (await request<{ settlements: Settlement[] }>(collection)).settlements
        latestDetail = settlements[0] ? await getDetail(settlements[0].id) : null
        return latestDetail ? settlementState(latestDetail) : null
      }
      if (preparePreview) {
        await prepareCompetitionPointsPreview({
          get: readLatest,
          create: async () => { await request(collection, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
          calculate: async current => { await request(`${collection}/${current.id}/calculate`, { method: 'POST', headers: { 'If-Match': String(current.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' }) },
        })
      } else await readLatest()
      previewBaseline.current = latestDetail ? settlementState(latestDetail) : null
      setDetail(latestDetail)
    } catch (cause) { setFeedback({ tone: 'error', title: 'No pudimos preparar la vista previa', message: cause instanceof Error ? cause.message : 'Intentá nuevamente.' }) }
    finally { setLoading(false) }
  }, [collection, getDetail])
  useEffect(() => { const timer = window.setTimeout(() => void load(true), 0); return () => window.clearTimeout(timer) }, [load])
  useEffect(() => { onStatusChange?.(detail?.settlement.status ?? null) }, [detail?.settlement.status, onStatusChange])

  function beginAdjustment() {
    if (!detail) return
    setPointValues(rulesFromSnapshot(detail))
    setAdjusting(true)
  }

  async function publishPoints() {
    if (!detail || busy) return
    const baseline = previewBaseline.current
    if (!baseline || baseline.id !== detail.settlement.id) return
    setBusy('publish'); setFeedback(null)
    try {
      const transition = async (operation: 'submit' | 'approve' | 'publish', current: WorkflowState) => (await request<TransitionResponse>(`${collection}/${current.id}/${operation}`, { method: 'POST', headers: { 'If-Match': String(current.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })).state
      await publishCompetitionPoints({
        get: async () => baseline,
        submit: current => transition('submit', current),
        approve: current => transition('approve', current),
        publish: current => transition('publish', current),
      })
      setFeedback({ tone: 'success', title: 'Puntos publicados', message: 'El ranking del circuito ya fue actualizado.' })
      await load(false)
    } catch (cause) {
      const error = cause as ApiError
      if (error.status === 412 && error.code === 'PRECONDITION_FAILED') {
        await load(false)
        setFeedback({ tone: 'warning', title: 'Vista previa actualizada', message: 'Actualizamos la vista previa porque cambió el cálculo. Revisala y volvé a publicar.' })
      } else setFeedback({ tone: 'error', title: 'No pudimos publicar los puntos', message: error.message })
    } finally { setBusy('') }
  }

  async function saveAdjustment() {
    if (!detail || busy || !['DRAFT', 'CALCULATED'].includes(detail.settlement.status)) return
    const invalid = ruleCodes.some(code => !Number.isInteger(pointValues[code]) || pointValues[code] < 0)
    if (invalid) { setPointsValidation('Todos los valores deben ser números enteros mayores o iguales a cero.'); return }
    setPointsValidation('')
    const tournamentName = String(detail.tournament?.name ?? 'esta fecha')
    const currentSchemeName = String(detail.pointsScheme?.display_name ?? detail.pointsScheme?.name ?? 'Esquema')
    const baseSchemeName = currentSchemeName.split(' · ')[0]
    setBusy('adjust'); setFeedback(null)
    try {
      await request(`${collection}/${detail.settlement.id}/adjust-points`, {
        method: 'POST',
        headers: { 'If-Match': String(detail.settlement.revision), 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ name: `${baseSchemeName} · ${tournamentName}`, rules: ruleCodes.filter(code => {
          if (!['EIGHTH_FINALIST', 'SIXTEENTH_FINALIST'].includes(code)) return true
          const snapshot = record(detail.settlement.calculation_snapshot)
          const rules = Array.isArray(snapshot.points_rules) ? snapshot.points_rules.map(record) : []
          return pointValues[code] > 0 || rules.some(rule => String(rule.rule_key).toUpperCase() === code)
        }).map(rule_key => ({ rule_key, points: pointValues[rule_key] })) }),
      })
      setAdjusting(false)
      await load(false)
      setFeedback({ tone: 'success', title: 'Vista previa recalculada', message: 'La tabla original del circuito no fue modificada.' })
    } catch (cause) {
      const error = cause as ApiError
      if (error.status === 412) {
        setAdjusting(false); await load(false)
        setFeedback({ tone: 'warning', title: 'Vista previa actualizada', message: 'El cálculo cambió mientras editabas. Revisá los valores actuales antes de guardar.' })
      } else setFeedback({ tone: 'error', title: 'No pudimos ajustar los puntos', message: error.message })
    } finally { setBusy('') }
  }

  async function createCorrection() {
    if (!detail || busy || detail.settlement.status !== 'PUBLISHED') return
    setBusy('correction'); setFeedback(null)
    try {
      await request(`${collection}/${detail.settlement.id}/correction`, { method: 'POST', headers: { 'If-Match': String(detail.settlement.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })
      setConfirmingCorrection(false)
      await load(true)
      setFeedback({ tone: 'warning', title: 'Corrección creada', message: 'Revisá la nueva vista previa antes de volver a publicar.' })
    } catch (cause) {
      const error = cause as ApiError
      if (error.status === 412) {
        setConfirmingCorrection(false); await load(false)
        setFeedback({ tone: 'warning', title: 'Estado actualizado', message: 'Actualizamos la liquidación porque cambió mientras confirmabas. Revisá su estado antes de continuar.' })
      } else setFeedback({ tone: 'error', title: 'No pudimos crear la corrección', message: error.message })
    }
    finally { setBusy('') }
  }

  const preview = useMemo(() => {
    if (!detail) return []
    const unique = new Map<string, { label: string; points: number; position: number }>()
    for (const award of detail.awards) {
      const code = String(award.result_code ?? 'PARTICIPATION').toUpperCase()
      const points = Number(award.total_points ?? 0)
      const key = `${code}:${points}`
      if (!unique.has(key)) unique.set(key, { label: resultLabels[code] ?? code.toLowerCase().replaceAll('_', ' '), points, position: Number(award.final_position ?? 999) })
    }
    return [...unique.values()].sort((left, right) => left.position - right.position || right.points - left.points)
  }, [detail])

  const calculationSnapshot = record(detail?.settlement.calculation_snapshot)
  const adjustmentSnapshot = record(calculationSnapshot.points_adjustment)
  const futureSchemeId = String(adjustmentSnapshot.source_points_scheme_id ?? detail?.settlement.points_scheme_id ?? '')
  const schemeName = String(detail?.pointsScheme?.display_name ?? detail?.pointsScheme?.name ?? 'Sin esquema')
  const sourceName = String(detail?.tournament?.name ?? 'torneo vinculado')
  const canAdjust = Boolean(detail && ['DRAFT', 'CALCULATED'].includes(detail.settlement.status))

  return <section className={styles.panel}>
    {feedback ? <ActionFeedbackNotice {...feedback} onDismiss={() => setFeedback(null)} /> : null}
    <header><div><small>PUNTOS</small><h2>Revisar antes de publicar</h2></div>{detail ? <span>{labels[detail.settlement.status] ?? detail.settlement.status}</span> : null}</header>
    {loading ? <p className={styles.loading}><RefreshCw size={15} />Preparando vista previa…</p> : detail ? <>
      <div className={styles.totals}><div><strong>{detail.totals.awards}</strong><small>Asignaciones</small></div><div><strong>{detail.totals.calculated.toLocaleString('es-AR')}</strong><small>Puntos calculados</small></div><div><strong>{detail.totals.movements}</strong><small>Movimientos publicados</small></div></div>
      <dl className={styles.source}><div><dt>Esquema usado</dt><dd>{schemeName}</dd></div><div><dt>Fuente</dt><dd>Snapshot de {sourceName}</dd></div></dl>
      {preview.length ? <div className={styles.preview}><small>DISTRIBUCIÓN</small>{preview.map(item => <div key={`${item.label}-${item.points}`}><span>{item.label}</span><strong>{item.points.toLocaleString('es-AR')} pts</strong></div>)}</div> : null}
      {adjusting && canAdjust ? <div className={styles.adjust}><div><strong>Ajustar puntos de esta fecha</strong><p>Se creará una copia privada. La tabla general del circuito no cambiará.</p></div>{pointsValidation ? <p role="alert">{pointsValidation}</p> : null}{ruleCodes.map(code => <label key={code}><span>{resultLabels[code]}</span><input min="0" step="1" inputMode="numeric" type="number" value={pointValues[code]} onChange={event => { setPointsValidation(''); setPointValues(current => ({ ...current, [code]: Number(event.target.value) })) }} /></label>)}<div className={styles.adjustActions}><button type="button" onClick={() => setAdjusting(false)}>Cancelar</button><button type="button" disabled={busy === 'adjust'} onClick={() => void saveAdjustment()}>{busy === 'adjust' ? 'Recalculando…' : 'Guardar y recalcular'}</button></div></div> : null}
      {detail.preflight.blockers.length || detail.preflight.warnings.length ? <div className={styles.issues}>{detail.preflight.blockers.map((issue, index) => <p className={styles.blocker} key={`blocker-${index}`}><AlertCircle size={14} />{issueText(issue)}</p>)}{detail.preflight.warnings.map((issue, index) => <p key={`warning-${index}`}><AlertCircle size={14} />{issueText(issue)}</p>)}</div> : null}
      {detail.settlement.status === 'PUBLISHED' ? <><p className={styles.published}><Check size={16} /><span><strong>Puntos publicados</strong><small>Para modificarlos, creá una corrección. La versión publicada no se edita.</small></span></p>{confirmingCorrection ? <div className={styles.correction}><p>La corrección revertirá los movimientos actuales y creará una nueva versión para revisar.</p><div><button type="button" onClick={() => setConfirmingCorrection(false)}>Cancelar</button><button type="button" disabled={busy === 'correction'} onClick={() => void createCorrection()}>{busy === 'correction' ? 'Creando…' : 'Confirmar corrección'}</button></div></div> : <button className={styles.secondary} type="button" onClick={() => setConfirmingCorrection(true)}>Crear corrección</button>}<Link className={styles.rankingLink} href={`/club/competition/series/${seriesId}?tab=ranking`}>Ver ranking</Link></> : <div className={styles.actions}>{canAdjust ? <button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={beginAdjustment}><SlidersHorizontal size={15} />Ajustar puntos</button> : null}<button className={styles.publish} type="button" disabled={Boolean(busy) || detail.preflight.blockers.length > 0 || detail.settlement.status === 'DRAFT'} onClick={() => void publishPoints()}>{busy === 'publish' ? 'Publicando…' : 'Publicar puntos'}</button></div>}
      {futureSchemeId ? <Link className={styles.futureLink} href={`/club/competition/points-schemes/${futureSchemeId}`}>Editar tabla del circuito para próximas fechas</Link> : null}
    </> : <div className={styles.empty}><Coins size={21} /><div><strong>No pudimos generar la vista previa</strong><p>Reintentá para preparar los puntos homologados.</p></div><button type="button" onClick={() => void load(true)}>Reintentar</button></div>}
  </section>
}
