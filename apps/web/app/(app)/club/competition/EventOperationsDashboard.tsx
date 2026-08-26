'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, CalendarDays, Check, ChevronRight, Circle, MapPin, RefreshCw, Trophy } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionEventDetail } from '@/features/competition/events/competition-events.types'
import styles from './EventOperationsDashboard.module.css'

type EventDetail = CompetitionEventDetail & { allowed_actions: Record<string, boolean> }
type RecordRow = Record<string, unknown>
type CompletionPreflight = { ready: boolean; blockers: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }>; tournament: { id: string; name: string; status: string | null } | null }
type DivisionOps = { homologations: RecordRow[]; settlements: RecordRow[]; preflight: CompletionPreflight | null }
type ApiError = Error & { status?: number }
const labels: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', ACTIVE: 'Activo', COMPLETED: 'Finalizado', CANCELLED: 'Cancelado', APPROVED: 'Aprobada', PUBLISHED: 'Publicado', SUBMITTED: 'En revisión' }
const eventTypes: Record<string, string> = { STANDARD: 'Competitivo', EXHIBITION: 'Exhibición', FRIENDLY: 'Amistoso' }
const blockerText: Record<string, string> = { SERIES_NOT_ACTIVE: 'El circuito todavía no está activo.', DATES_MISSING: 'Faltan la fecha de inicio o fin.', TIMEZONE_MISSING: 'Falta definir la zona horaria.', DIVISIONS_MISSING: 'Agregá al menos una división.', DIVISION_CONFIGURATION_INVALID: 'Hay una división sin configuración completa.', TOURNAMENT_LINK_MISSING: 'Falta vincular un torneo.' }

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

export default function EventOperationsDashboard({ seriesId, eventId }: { seriesId: string; eventId: string }) {
  const { activeClub } = useSession()
  const clubId = activeClub?.id
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [operations, setOperations] = useState<Record<string, DivisionOps>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
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
        const [homologations, settlements, preflight] = await Promise.all([
          api<{ homologations: RecordRow[] }>(`${base}/divisions/${id}/homologations`),
          api<{ settlements: RecordRow[] }>(`${base}/divisions/${id}/settlements`),
          String(division.status) === 'SCHEDULED' ? api<CompletionPreflight>(`${base}/divisions/${id}/complete`) : Promise.resolve(null),
        ])
        return [id, { homologations: homologations.homologations, settlements: settlements.settlements, preflight }] as const
      }))
      setDetail(event); setOperations(Object.fromEntries(entries))
    } catch (cause) { setError(cause as ApiError) }
    finally { setLoading(false) }
  }, [base, clubId])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function completeDivision(id: string) {
    if (!detail) return
    setBusy(id); setError(null)
    try {
      await api(`${base}/divisions/${id}/complete`, { method: 'POST', headers: { 'If-Match': String(detail.event.revision), 'Idempotency-Key': crypto.randomUUID() }, body: '{}' })
      setConfirming(null); await load()
    } catch (cause) { const next = cause as ApiError; setError(next); if (next.status === 412) { setConfirming(null); await load() } }
    finally { setBusy(null) }
  }

  async function completeEvent() {
    if (!detail) return
    setBusy('event'); setError(null)
    try {
      await api(`${base}/complete`, { method:'POST', headers:{ 'If-Match':String(detail.event.revision), 'Idempotency-Key':crypto.randomUUID() }, body:'{}' })
      await load()
    } catch (cause) { const next=cause as ApiError; setError(next); if(next.status===412) await load() }
    finally { setBusy(null) }
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
  const blockers = Array.isArray(detail.completeness.blockers) ? detail.completeness.blockers.map(value => String(typeof value === 'object' && value ? (value as RecordRow).code ?? (value as RecordRow).reason ?? '' : value)).filter(Boolean) : []
  const warnings = Array.isArray(detail.completeness.warnings) ? detail.completeness.warnings : []
  const eventEditorHref = `/club/competition/series/${seriesId}?tab=dates&event=${eventId}`
  const primaryAction = detail.allowed_actions.edit ? { label: 'Configurar', href: eventEditorHref } : detail.allowed_actions.schedule ? { label: 'Programar', href: eventEditorHref } : null

  return <main className={styles.page}>
    <header className={styles.hero}><div className={styles.eyebrow}><Link href={`/club/competition/series/${seriesId}?tab=dates`} aria-label="Volver"><ArrowLeft size={18} /></Link><span>OPERACIÓN DE FECHA</span><b className={`${styles.badge} ${styles[`status_${event.status}`]}`}>{labels[event.status]}</b></div><div className={styles.title}><div><h1>{event.name}</h1><p><CalendarDays size={14} />{event.planned_starts_at ? new Date(event.planned_starts_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}{event.venue_name ? <><MapPin size={14} />{event.venue_name}</> : null}</p></div>{primaryAction ? <Link className={styles.primary} href={primaryAction.href}>{primaryAction.label}</Link> : detail.allowed_actions.complete ? <button className={styles.primary} type="button" disabled={busy==='event'} onClick={() => void completeEvent()}>{busy==='event'?'Cerrando…':'Finalizar fecha'}</button> : null}</div><div className={styles.meta}><span>{eventTypes[event.event_type]}</span><span>{event.is_public ? 'Pública' : 'Privada'}</span><span>Rev. {event.revision}</span></div></header>

    <section className={styles.kpis}><div><strong>{activeDivisions.length}</strong><small>Divisiones</small></div><div><strong>{summary.ready}</strong><small>Listas</small></div><div><strong>{summary.linked}</strong><small>Torneos</small></div></section>
    {(blockers.length || warnings.length) ? <section className={styles.alerts}>{blockers.map(item => <p key={item}><AlertCircle size={15} />{blockerText[item.split(':')[0]] ?? 'Hay una configuración pendiente.'}</p>)}{warnings.map((_, index) => <p key={`warning-${index}`}><AlertCircle size={15} />Revisá una advertencia antes de continuar.</p>)}</section> : null}
    <section className={styles.pending}><span><b>{summary.pendingHomologations}</b> revisiones</span><span><b>{summary.pendingSettlements}</b> cierres de puntos</span><span><b>{summary.pendingPublications}</b> publicaciones</span></section>

    <section className={styles.section}><div className={styles.sectionTitle}><div><span>DIVISIONES</span><h2>Operación deportiva</h2></div></div>
      {!activeDivisions.length ? <div className={styles.empty}><Trophy size={22} /><strong>Esta fecha no tiene divisiones</strong><p>Agregalas desde la configuración del circuito.</p>{detail.allowed_actions.edit ? <Link href={`/club/competition/series/${seriesId}`}>Configurar divisiones</Link> : null}</div> : <div className={styles.list}>{activeDivisions.map(division => {
        const id = String(division.id), ops = operations[id] ?? { homologations: [], settlements: [], preflight: null }, homologation = latest(ops.homologations), settlement = latest(ops.settlements), link = division.active_tournament_link, completed = String(division.status) === 'COMPLETED'
        const homologationHref = `/club/competition/series/${seriesId}/events/${eventId}/divisions/${id}/homologation`
        const progress = completed ? 'Resultados listos para homologar' : ops.preflight?.ready ? 'Listo para cerrar' : link ? ops.preflight?.blockers.some(item => ['MATCHES_INCOMPLETE', 'FINAL_INCOMPLETE', 'FINAL_MISSING'].includes(item.code)) ? 'Resultados incompletos' : 'Torneo en curso' : 'Sin torneo vinculado'
        return <article className={styles.division} key={id}><div className={styles.divisionHead}><div><strong>{snapshotName(division)}</strong><small>{division.scoring_mode === 'POINTS' ? 'Con puntos' : division.scoring_mode === 'NON_SCORING' ? 'Sin puntos' : 'Puntuación pendiente'} · {String(division.tier?.name ?? 'Nivel por definir')}</small></div><span className={styles.badge}>{labels[String(division.status)] ?? String(division.status)}</span></div><p className={`${styles.progress} ${ops.preflight?.ready || completed ? styles.progressReady : ''}`}>{progress}</p><dl><div><dt>Regla</dt><dd>{String(division.rule?.name ?? 'Sin configurar')}</dd></div><div><dt>Torneo</dt><dd>{link ? 'Vinculado' : 'Sin torneo'}</dd></div><div><dt>Resultados</dt><dd>{homologation ? labels[status(homologation)] ?? status(homologation) : 'Pendiente'}</dd></div><div><dt>Puntos</dt><dd>{settlement ? labels[status(settlement)] ?? status(settlement) : 'Pendiente'}</dd></div></dl>{completed ? <Link className={styles.action} href={homologationHref}>{homologation ? 'Revisar resultados' : 'Homologar resultados'}<ChevronRight size={16} /></Link> : ops.preflight?.ready && detail.allowed_actions.complete_division ? <button className={styles.action} onClick={() => setConfirming(id)}>Cerrar división y preparar homologación<ChevronRight size={16} /></button> : !link ? <Link className={styles.action} href={eventEditorHref}>Vincular torneo<ChevronRight size={16} /></Link> : null}{confirming === id && ops.preflight ? <div className={styles.confirm}><strong>¿Cerrar esta división?</strong><p>El torneo tiene final y campeón. Esta acción no modifica resultados ni publica puntos.</p>{ops.preflight.warnings.map(item => <small key={item.code}><AlertCircle size={13} />{item.message}</small>)}<div><button onClick={() => setConfirming(null)}>Volver</button><button disabled={busy === id} onClick={() => void completeDivision(id)}>{busy === id ? 'Cerrando…' : 'Confirmar cierre'}</button></div></div> : null}{ops.preflight && !ops.preflight.ready ? <div className={styles.preflight}>{ops.preflight.blockers.map(item => <small key={item.code}><AlertCircle size={13} />{item.message}</small>)}</div> : null}{link ? <Link className={styles.tournament} href={`/club/torneos/${String(link.tournament_id)}`}>Ver torneo</Link> : null}</article>
      })}</div>}
    </section>

    <section className={styles.timeline}><div className={styles.sectionTitle}><div><span>TRAZABILIDAD</span><h2>Timeline operativo</h2></div></div>{[
      ['Fecha creada', true], ['Torneo vinculado', summary.linked > 0], ['Resultados completados', event.status === 'COMPLETED'], ['Resultados revisados', activeDivisions.length > 0 && summary.pendingHomologations === 0], ['Puntos calculados', activeDivisions.length > 0 && summary.pendingSettlements === 0 && Object.values(operations).some(item => item.settlements.length)], ['Puntos publicados', activeDivisions.length > 0 && summary.pendingPublications === 0 && Object.values(operations).some(item => item.settlements.some(row => status(row) === 'PUBLISHED'))], ['Ranking actualizado', Object.values(operations).some(item => item.settlements.some(row => status(row) === 'PUBLISHED'))],
    ].map(([label, done]) => <div className={done ? styles.done : ''} key={String(label)}>{done ? <Check size={14} /> : <Circle size={12} />}<span>{label}</span></div>)}</section>
  </main>
}
