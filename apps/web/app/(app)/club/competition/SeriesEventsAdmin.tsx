'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Archive, CalendarDays, ChevronRight, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionEventDetail, CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import type { CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import styles from './SeriesEventsAdmin.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type EventAdminDetail = CompetitionEventDetail & { allowed_actions: Record<string, boolean> }
type Option = { id: string; name: string }
type Props = { clubId: string; series: CompetitionSeriesDetail; events: CompetitionSeriesEvent[]; request: Request; reload: () => Promise<void>; hideCreate?: boolean }
const statusLabel: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', COMPLETED: 'Finalizado', CANCELLED: 'Cancelado' }
const typeLabel: Record<string, string> = { STANDARD: 'Competitivo', EXHIBITION: 'Exhibición', FRIENDLY: 'Amistoso' }
const blockerLabel: Record<string, string> = { SERIES_NOT_ACTIVE: 'Activá el circuito para programar la fecha.', DATES_MISSING: 'Completá inicio y fin.', TIMEZONE_MISSING: 'Guardá la fecha para definir la zona horaria.', DIVISIONS_MISSING: 'Agregá al menos una división.' }
const idempotency = () => crypto.randomUUID()
const localValue = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : ''

export default function SeriesEventsAdmin({ clubId, series, events, request, reload, hideCreate = false }: Props) {
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, EventAdminDetail>>({})
  const [detail, setDetail] = useState<EventAdminDetail | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [reason, setReason] = useState('')
  const [tiers, setTiers] = useState<Option[]>([])
  const [schemes, setSchemes] = useState<Option[]>([])
  const [tournaments, setTournaments] = useState<Option[]>([])

  const base = `/api/clubs/${clubId}/competition/series/${series.series.id}/events`
  const json = (body: unknown, method = 'POST', revision?: number, lifecycle = false): RequestInit => ({ method, body: JSON.stringify(body), headers: { ...(revision ? { 'If-Match': String(revision) } : {}), ...(lifecycle ? { 'Idempotency-Key': idempotency() } : {}) } })

  const loadDetail = useCallback(async (id: string, open = true) => {
    if (open) { setSelectedId(id); setBusy('load'); setNotice(null) }
    try {
      const data = await request<EventAdminDetail>(`${base}/${id}`)
      setDetails(current => ({ ...current, [id]: data })); if (open) setDetail(data)
    } catch (cause) { if (open) setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos cargar la fecha.' }) }
    finally { if (open) setBusy('') }
  }, [base, request])

  useEffect(() => {
    let active = true
    void Promise.all(events.map(event => request<EventAdminDetail>(`${base}/${event.id}`))).then(items => {
      if (active) setDetails(Object.fromEntries(items.map(item => [item.event.id, item])))
    }).catch(() => undefined)
    return () => { active = false }
  }, [base, events, request])

  useEffect(() => {
    const eventId = searchParams.get('event')
    const timer = window.setTimeout(() => { if (eventId && events.some(event => event.id === eventId) && selectedId !== eventId) void loadDetail(eventId) }, 0)
    return () => window.clearTimeout(timer)
  }, [events, loadDetail, searchParams, selectedId])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    void Promise.all([
      supabase.from('competition_event_tiers').select('id,name').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
      supabase.from('points_schemes').select('id,name').eq('is_active', true).or(`club_id.eq.${clubId},is_global.eq.true`).order('name'),
      supabase.from('tournaments').select('id,name').eq('club_id', clubId).order('created_at', { ascending: false }).limit(100),
    ]).then(([tierResult, schemeResult, tournamentResult]) => {
      if (!active) return
      if (tierResult.error || schemeResult.error || tournamentResult.error) setNotice({ kind: 'error', text: 'No pudimos cargar las opciones de la fecha.' })
      else { setTiers(tierResult.data ?? []); setSchemes(schemeResult.data ?? []); setTournaments(tournamentResult.data ?? []) }
    })
    return () => { active = false }
  }, [clubId, selectedId])

  async function mutate(key: string, action: () => Promise<EventAdminDetail>, success: string) {
    setBusy(key); setNotice(null)
    try { const next = await action(); setDetail(next); setDetails(current => ({ ...current, [next.event.id]: next })); setNotice({ kind: 'ok', text: success }); await reload() }
    catch (cause) {
      const error = cause as Error & { status?: number }
      setNotice({ kind: 'error', text: error.message })
      if (error.status === 412 && selectedId) await loadDetail(selectedId, false)
    } finally { setBusy('') }
  }

  async function createEvent() {
    if (!newName.trim()) return
    setBusy('create'); setNotice(null)
    try { const result = await request<{ event: CompetitionSeriesEvent }>(base, json({ name: newName.trim() })); setNewName(''); await reload(); await loadDetail(result.event.id) }
    catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos crear la fecha.' }) }
    finally { setBusy('') }
  }

  function saveEvent(form: HTMLFormElement) {
    if (!detail) return
    const data = new FormData(form)
    void mutate('save', () => request(`${base}/${detail.event.id}`, json({ name: data.get('name'), event_type: data.get('type'), planned_starts_at: data.get('start') || null, planned_ends_at: data.get('end') || null, timezone: 'America/Argentina/Buenos_Aires', venue_name: data.get('venue') || null, venue_address: data.get('address') || null }, 'PATCH', detail.event.revision)), 'Cambios guardados.')
  }

  const activeSeriesDivisions = series.divisions.filter(item => item.is_active)
  const linkedSeriesIds = new Set(detail?.divisions.filter(item => item.is_active).map(item => String(item.series_division_id)) ?? [])
  const availableDivisions = activeSeriesDivisions.filter(item => !linkedSeriesIds.has(item.id))
  const activeDivisions = useMemo(() => detail?.divisions.filter(item => item.is_active) ?? [], [detail])
  const scoring = useMemo(() => {
    const modes = new Set(activeDivisions.map(item => String(item.scoring_mode ?? '')).filter(Boolean))
    return modes.size === 1 ? [...modes][0] : modes.size > 1 ? 'MIXED' : null
  }, [activeDivisions])

  const lifecycle = (operation: 'schedule' | 'cancel' | 'archive') => detail && void mutate(operation, () => request(`${base}/${detail.event.id}/${operation}`, json(operation === 'cancel' ? { reason } : {}, 'POST', detail.event.revision, true)), operation === 'schedule' ? 'Fecha programada.' : operation === 'cancel' ? 'Fecha cancelada.' : 'Fecha archivada.')

  return <section className={styles.events}>
    {!hideCreate ? <header><div><span>FECHAS</span><h2>Agenda del circuito</h2></div>{series.series.status === 'SCHEDULED' || series.series.status === 'ACTIVE' ? <details><summary><Plus size={15} />Nueva fecha</summary><div className={styles.create}><input value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nombre de la fecha" maxLength={120} /><button disabled={!newName.trim() || busy === 'create'} onClick={() => void createEvent()}>{busy === 'create' ? 'Creando…' : 'Crear borrador'}</button></div></details> : null}</header> : null}
    {notice && !selectedId ? <p className={notice.kind === 'error' ? styles.error : styles.success}>{notice.text}</p> : null}
    {!events.length ? <div className={styles.empty}><CalendarDays size={22} /><strong>Sin fechas todavía</strong><p>Creá el primer borrador cuando el circuito esté programado.</p></div> : <div className={styles.list}>{events.map(event => {
      const item = details[event.id], divisions = item?.divisions.filter(value => value.is_active) ?? [], link = divisions.find(value => value.active_tournament_link)?.active_tournament_link
      const modes = new Set(divisions.map(value => String(value.scoring_mode ?? '')).filter(Boolean))
      return <Link className={styles.row} key={event.id} href={`/club/competition/series/${series.series.id}/events/${event.id}`}><div><strong>{event.name}</strong><small>{typeLabel[event.event_type]} · {modes.size === 1 ? [...modes][0] === 'POINTS' ? 'Con puntos' : 'Sin puntos' : modes.size > 1 ? 'Scoring mixto' : 'Sin scoring'}</small><small>{event.planned_starts_at ? new Date(event.planned_starts_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'} · {divisions.length} divisiones{link ? ' · Torneo vinculado' : ''}</small></div><span className={`${styles.badge} ${styles[`status_${event.status}`]}`}>{statusLabel[event.status]}</span><ChevronRight size={17} /></Link>})}</div>}

    {selectedId ? <div className={styles.backdrop} onClick={() => setSelectedId(null)}><aside className={styles.sheet} role="dialog" aria-modal="true" aria-label="Editar fecha" onClick={event => event.stopPropagation()}><div className={styles.sheetHead}><div><small>FECHA DEL CIRCUITO</small><h3>{detail?.event.name ?? 'Cargando…'}</h3></div><div className={styles.sheetActions}>{detail?.allowed_actions.edit ? <button type="submit" form="event-edit-form">Guardar</button> : null}<button onClick={() => setSelectedId(null)} aria-label="Cerrar"><X size={19} /></button></div></div>{busy === 'load' || !detail ? <div className={styles.loading}><LoaderCircle size={20} />Cargando…</div> : <div className={styles.sheetBody}>
      {notice ? <p className={notice.kind === 'error' ? styles.error : styles.success}>{notice.text}</p> : null}
      <form id="event-edit-form" className={styles.form} onSubmit={event => { event.preventDefault(); saveEvent(event.currentTarget) }}><details open><summary>Identidad y sede</summary><div><label>Nombre<input name="name" defaultValue={detail.event.name} /></label><label>Tipo<select name="type" defaultValue={detail.event.event_type}><option value="STANDARD">Competitivo</option><option value="EXHIBITION">Exhibición</option><option value="FRIENDLY">Amistoso</option></select></label><label>Inicio<input name="start" type="datetime-local" defaultValue={localValue(detail.event.planned_starts_at)} /></label><label>Fin<input name="end" type="datetime-local" defaultValue={localValue(detail.event.planned_ends_at)} /></label><label>Sede<input name="venue" defaultValue={detail.event.venue_name ?? ''} /></label><label>Dirección<input name="address" defaultValue={detail.event.venue_address ?? ''} /></label></div></details></form>
      <details className={styles.disclosure} open><summary>Divisiones <span>{activeDivisions.length}</span></summary><div>{activeDivisions.map(division => {
        const configure = (mode: string, tierId: string | null, schemeId: string | null) => void mutate(`score-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}`, json({ scoring_mode: mode, event_tier_id: mode === 'POINTS' ? tierId : null, points_scheme_override_id: mode === 'POINTS' ? schemeId : null, points_multiplier_override: mode === 'POINTS' ? 1 : null }, 'PATCH', detail.event.revision)), 'Configuración deportiva actualizada.')
        return <article className={styles.division} key={String(division.id)}><header><strong>{String((division.configuration_snapshot as Record<string, unknown> | null)?.division ?? `División ${Number(division.sort_order) + 1}`)}</strong><button aria-label="Quitar división" disabled={!detail.allowed_actions.edit} onClick={() => void mutate(`remove-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}`, json({ reason: 'Retirada desde administración.' }, 'DELETE', detail.event.revision)), 'División retirada.')}><Trash2 size={15} /></button></header><div className={styles.divisionGrid}>
          <select aria-label="Scoring" value={String(division.scoring_mode ?? '')} onChange={event => configure(event.target.value, tiers[0]?.id ?? null, schemes[0]?.id ?? null)}><option value="">Elegir scoring</option><option value="POINTS">Con puntos</option><option value="NON_SCORING">Sin puntos</option></select>
          {division.scoring_mode === 'POINTS' ? <><select aria-label="Nivel del evento" value={String(division.event_tier_id ?? '')} onChange={event => configure('POINTS', event.target.value, String(division.points_scheme_override_id ?? schemes[0]?.id ?? '') || null)}><option value="">Elegir nivel</option>{tiers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Esquema de puntos" value={String(division.points_scheme_override_id ?? '')} onChange={event => configure('POINTS', String(division.event_tier_id ?? tiers[0]?.id ?? '') || null, event.target.value)}><option value="">Elegir esquema</option>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : null}
          <select aria-label="Torneo vinculado" value={String((division.active_tournament_link as Record<string, unknown> | null)?.tournament_id ?? '')} onChange={event => { if (!event.target.value) return; void mutate(`link-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}/tournament-link`, json({ tournament_id: event.target.value, reason: 'Vinculado desde administración.' }, division.active_tournament_link ? 'PATCH' : 'POST', detail.event.revision, true)), 'Torneo vinculado.') }}><option value="">Sin torneo</option>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </div></article>
      })}{availableDivisions.length ? <div className={styles.addDivision}><select id="event-division"><option value="">Elegir división</option>{availableDivisions.map(item => <option key={item.id} value={item.id}>{String(item.division_snapshot?.division_name ?? item.division_snapshot?.division_label ?? 'División')}</option>)}</select><button onClick={() => { const id = (document.getElementById('event-division') as HTMLSelectElement | null)?.value; if (id) void mutate('add-division', () => request(`${base}/${detail.event.id}/divisions`, json({ series_division_id: id, sort_order: activeDivisions.length }, 'POST', detail.event.revision)), 'División agregada.') }}>Agregar</button></div> : null}</div></details>
      <details className={styles.disclosure}><summary>Acciones rápidas</summary><div className={styles.actions}><p>{detail.event.status === 'DRAFT' ? `${activeDivisions.length} divisiones · ${scoring === 'POINTS' ? 'Con puntos' : scoring === 'NON_SCORING' ? 'Sin puntos' : 'Configuración pendiente'}` : statusLabel[detail.event.status]}</p>{Array.isArray(detail.completeness.blockers) && detail.completeness.blockers.length ? <ul>{detail.completeness.blockers.map(value => <li key={String(value)}>{blockerLabel[String(value).split(':')[0]] ?? 'Queda una configuración pendiente.'}</li>)}</ul> : null}{detail.allowed_actions.schedule ? <button onClick={() => lifecycle('schedule')}>Programar evento</button> : null}<label>Motivo<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo para cancelar" /></label>{detail.allowed_actions.cancel ? <button className={styles.danger} disabled={!reason.trim()} onClick={() => lifecycle('cancel')}>Cancelar evento</button> : null}{detail.allowed_actions.archive ? <button onClick={() => lifecycle('archive')}><Archive size={15} />Archivar</button> : null}</div></details>
    </div>}</aside></div> : null}
  </section>
}
