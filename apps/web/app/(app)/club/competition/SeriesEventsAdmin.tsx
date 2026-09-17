'use client'

import { toast } from '@/lib/toastStore'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Archive, CalendarDays, ChevronRight, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionEventDetail, CompetitionSeriesEvent } from '@/features/competition/events/competition-events.types'
import type { CompetitionSeriesDetail } from '@/features/competition/series/competition-series.types'
import { competitionEventIssueCode, competitionEventIssueLabel, isActionableCompetitionEventIssue, uniqueCompetitionEventIssues } from '@/lib/competitionEventIssues'
import { deriveCompetitionEventOperationalState } from '@/lib/competitionTournamentState'
import { competitionWallTime, competitionWallTimeToInstant, resolveCompetitionTimezone, validCompetitionTimezone } from '@/lib/competitionTimezone'
import TimezoneSelector from './TimezoneSelector'
import EventTournamentConfiguration from './EventTournamentConfiguration'
import { getTournamentEditableCapabilities, type TournamentConfigurationDetail, type TournamentEditableCapabilities } from '@/lib/tournamentOperationalConfiguration'
import styles from './SeriesEventsAdmin.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type EventAdminDetail = CompetitionEventDetail & { allowed_actions: Record<string, boolean> }
type Option = { id: string; name: string }
type Props = { clubId: string; series: CompetitionSeriesDetail; events: CompetitionSeriesEvent[]; request: Request; reload: () => Promise<void>; hideCreate?: boolean; hideList?: boolean }
const statusLabel: Record<string, string> = { DRAFT: 'Borrador', SCHEDULED: 'Programado', COMPLETED: 'Finalizado', CANCELLED: 'Cancelado' }
const typeLabel: Record<string, string> = { STANDARD: 'Competitivo', EXHIBITION: 'Exhibición', FRIENDLY: 'Amistoso' }
const idempotency = () => crypto.randomUUID()
const localValue = competitionWallTime
function divisionName(division: Record<string, unknown>) {
  const snapshot = division.configuration_snapshot as Record<string, unknown> | null
  const identity = snapshot?.division as Record<string, unknown> | undefined
  return String(identity?.division_name ?? identity?.division_label ?? snapshot?.division_name ?? `División ${Number(division.sort_order ?? 0) + 1}`)
}

export default function SeriesEventsAdmin({ clubId, series, events, request, reload, hideCreate = false, hideList = false }: Props) {
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, EventAdminDetail>>({})
  const [detail, setDetail] = useState<EventAdminDetail | null>(null)
  const [tournamentCapabilities,setTournamentCapabilities]=useState<Record<string,TournamentEditableCapabilities>>({})
  const [timezone, setTimezone] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [reason, setReason] = useState('')
  const [tiers, setTiers] = useState<Option[]>([])
  const [schemes, setSchemes] = useState<Option[]>([])
  const [tournaments, setTournaments] = useState<Option[]>([])
  const dismissedEventId = useRef<string | null>(null)

  const base = `/api/clubs/${clubId}/competition/series/${series.series.id}/events`
  const json = (body: unknown, method = 'POST', revision?: number, lifecycle = false): RequestInit => ({ method, body: JSON.stringify(body), headers: { ...(revision ? { 'If-Match': String(revision) } : {}), ...(lifecycle ? { 'Idempotency-Key': idempotency() } : {}) } })

  const loadDetail = useCallback(async (id: string, open = true) => {
    if (open) { setSelectedId(id); setBusy('load'); setNotice(null) }
    try {
      const data = await request<EventAdminDetail>(`${base}/${id}`)
      const linked=await Promise.all(data.divisions.filter(division=>division.is_active&&division.active_tournament_link?.tournament_id).map(async division=>{
        const tournamentId=String(division.active_tournament_link?.tournament_id)
        try{
          const configuration=await request<TournamentConfigurationDetail>(`/api/clubs/${clubId}/tournaments/${tournamentId}/configuration`)
          return [tournamentId,configuration.capabilities] as const
        }catch{
          const capabilities=getTournamentEditableCapabilities({tournamentStatus:null,hasSeedSnapshot:false,hasGroups:false,hasMatches:false,registrationCount:0})
          for(const capability of Object.values(capabilities))capability.reason='No pudimos verificar los permisos del torneo. Recargá antes de editar.'
          return [tournamentId,capabilities] as const
        }
      }))
      setTournamentCapabilities(Object.fromEntries(linked))
      setDetails(current => ({ ...current, [id]: data })); if (open) { setDetail(data); setTimezone(resolveCompetitionTimezone({ tournamentTimezone: data.event.timezone, deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone })) }
    } catch (cause) { if (open) setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos cargar la fecha.' }) }
    finally { if (open) setBusy('') }
  }, [base, request,clubId])

  const closeEditor = useCallback(() => {
    dismissedEventId.current = selectedId
    setSelectedId(null)
    setDetail(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('event')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [selectedId])

  useEffect(() => {
    let active = true
    void Promise.all(events.map(event => request<EventAdminDetail>(`${base}/${event.id}`))).then(items => {
      if (active) setDetails(Object.fromEntries(items.map(item => [item.event.id, item])))
    }).catch(() => undefined)
    return () => { active = false }
  }, [base, events, request])

  useEffect(() => {
    const eventId = searchParams.get('event')
    if (!eventId) dismissedEventId.current = null
    const timer = window.setTimeout(() => { if (eventId && dismissedEventId.current !== eventId && events.some(event => event.id === eventId) && selectedId !== eventId) void loadDetail(eventId) }, 0)
    return () => window.clearTimeout(timer)
  }, [events, loadDetail, searchParams, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeEditor() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown) }
  }, [closeEditor, selectedId])

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

  async function mutate(key: string, action: () => Promise<EventAdminDetail>, success: string, options?: { closeOnSuccess?: boolean; errorPrefix?: string }) {
    if (busy) return
    setBusy(key); setNotice(null)
    try { const next = await action(); setDetail(next); setDetails(current => ({ ...current, [next.event.id]: next })); toast.success(success); await reload(); if (options?.closeOnSuccess) closeEditor() }
    catch (cause) {
      const error = cause as Error & { status?: number }
      toast.error(`${options?.errorPrefix ?? ''}${error.message}`)
      if (error.status === 412 && selectedId) await loadDetail(selectedId, false)
    } finally { setBusy('') }
  }

  async function createEvent() {
    if (!newName.trim()) return
    setBusy('create'); setNotice(null)
    try { const result = await request<{ event: CompetitionSeriesEvent }>(base, json({ name: newName.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })); setNewName(''); toast.success('Fecha creada en borrador.'); await reload(); await loadDetail(result.event.id) }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'No pudimos crear la fecha.') }
    finally { setBusy('') }
  }

  function saveEvent(form: HTMLFormElement) {
    if (!detail) return
    const data = new FormData(form)
    if (!validCompetitionTimezone(timezone)) { setNotice({ kind: 'error', text: 'Elegí una zona horaria válida.' }); return }
    let start: string | null, end: string | null
    try {
      start = fieldEditable('structure') ? (data.get('start') ? competitionWallTimeToInstant(String(data.get('start')), timezone!) : null) : detail.event.planned_starts_at
      end = fieldEditable('structure') ? (data.get('end') ? competitionWallTimeToInstant(String(data.get('end')), timezone!) : null) : detail.event.planned_ends_at
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'Revisá las fechas.' }); return }
    void mutate('save', () => request(`${base}/${detail.event.id}`, json({ name: fieldEditable('structure')?data.get('name'):detail.event.name, event_type: fieldEditable('structure')?data.get('type'):detail.event.event_type, planned_starts_at: start, planned_ends_at: end, timezone:fieldEditable('timezone')?timezone:detail.event.timezone, venue_name: fieldEditable('logistics')?(data.get('venue') || null):detail.event.venue_name, venue_address:fieldEditable('logistics')?(data.get('address') || null):detail.event.venue_address, is_public:fieldEditable('logistics')?data.get('visibility') === 'true':detail.event.is_public }, 'PATCH', detail.event.revision)), 'Configuración guardada.', { closeOnSuccess: true, errorPrefix: 'No pude guardar la configuración: ' })
  }

  const activeSeriesDivisions = series.divisions.filter(item => item.is_active)
  const linkedSeriesIds = new Set(detail?.divisions.filter(item => item.is_active).map(item => String(item.series_division_id)) ?? [])
  const availableDivisions = activeSeriesDivisions.filter(item => !linkedSeriesIds.has(item.id))
  const activeDivisions = useMemo(() => detail?.divisions.filter(item => item.is_active) ?? [], [detail])
  function fieldEditable(field:keyof TournamentEditableCapabilities){
    return Boolean(detail?.allowed_actions.edit)&&activeDivisions.every(division=>!division.active_tournament_link?.tournament_id||tournamentCapabilities[String(division.active_tournament_link.tournament_id)]?.[field].editable)
  }
  const fieldLock=(field:keyof TournamentEditableCapabilities)=>!fieldEditable(field)?<small className={styles.fieldLock}>🔒 {Object.values(tournamentCapabilities).find(capabilities=>!capabilities[field].editable)?.[field].reason??'No está disponible en el estado actual.'}</small>:null
  const scoring = useMemo(() => {
    const modes = new Set(activeDivisions.map(item => String(item.scoring_mode ?? '')).filter(Boolean))
    return modes.size === 1 ? [...modes][0] : modes.size > 1 ? 'MIXED' : null
  }, [activeDivisions])
  const completenessIssues = detail ? uniqueCompetitionEventIssues([
    ...(Array.isArray(detail.completeness.blockers) ? detail.completeness.blockers : []),
    ...(Array.isArray(detail.completeness.warnings) ? detail.completeness.warnings : []),
  ]).filter(issue => isActionableCompetitionEventIssue(issue, detail.event) && !(competitionEventIssueCode(issue) === 'TIMEZONE_MISSING' && validCompetitionTimezone(timezone))) : []

  const lifecycle = (operation: 'schedule' | 'cancel' | 'archive') => detail && void mutate(operation, () => request(`${base}/${detail.event.id}/${operation}`, json(operation === 'cancel' ? { reason } : {}, 'POST', detail.event.revision, true)), operation === 'schedule' ? 'Fecha programada.' : operation === 'cancel' ? 'Fecha cancelada.' : 'Fecha archivada.')

  return <section className={styles.events}>
    {!hideList && series.series.planned_events_count ? <small>{events.filter(event => !event.archived_at).length} de {series.series.planned_events_count} fechas creadas</small> : null}
    {!hideCreate ? <header><div><span>FECHAS</span><h2>Agenda del circuito</h2></div>{series.series.status === 'SCHEDULED' || series.series.status === 'ACTIVE' ? <details><summary><Plus size={15} />Nueva fecha</summary><div className={styles.create}><input value={newName} onChange={event => setNewName(event.target.value)} placeholder="Nombre de la fecha" maxLength={120} /><button disabled={!newName.trim() || busy === 'create'} onClick={() => void createEvent()}>{busy === 'create' ? 'Creando…' : 'Crear borrador'}</button></div></details> : null}</header> : null}
    {notice && !selectedId ? <p className={notice.kind === 'error' ? styles.error : styles.success}>{notice.text}</p> : null}
    {!hideList ? (!events.length ? <div className={styles.empty}><CalendarDays size={22} /><strong>Sin fechas todavía</strong><p>Creá el primer borrador cuando el circuito esté programado.</p></div> : <div className={styles.list}>{events.map(event => {
      const item = details[event.id], divisions = item?.divisions.filter(value => value.is_active) ?? [], link = divisions.find(value => value.active_tournament_link)?.active_tournament_link
      const modes = new Set(divisions.map(value => String(value.scoring_mode ?? '')).filter(Boolean))
      return <Link className={styles.row} key={event.id} href={`/club/competition/series/${series.series.id}/events/${event.id}`}><div><strong>{event.name}</strong><small>{typeLabel[event.event_type]} · {modes.size === 1 ? [...modes][0] === 'POINTS' ? 'Con puntos' : 'Sin puntos' : modes.size > 1 ? 'Puntuación mixta' : 'Puntuación pendiente'}</small><small>{event.planned_starts_at ? new Date(event.planned_starts_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'} · {divisions.length} divisiones{link ? ' · Torneo vinculado' : ''}</small></div><span className={`${styles.badge} ${styles[`status_${event.status}`]}`}>{deriveCompetitionEventOperationalState(item?.event ?? event).label}</span><ChevronRight size={17} /></Link>})}</div>) : null}

    {selectedId ? <div className={styles.backdrop} onClick={closeEditor}><aside className={styles.sheet} role="dialog" aria-modal="true" aria-label="Editar fecha" onClick={event => event.stopPropagation()}><div className={styles.sheetHead}><div><small>FECHA DEL CIRCUITO</small><h3>{detail?.event.name ?? 'Cargando…'}</h3></div><div className={styles.sheetActions}>{detail?.allowed_actions.edit ? <button type="submit" form="event-edit-form" disabled={Boolean(busy)}>{busy === 'save' ? 'Guardando…' : 'Guardar fecha'}</button> : null}<button type="button" onClick={closeEditor} aria-label="Cerrar editor"><X size={18} /><span>Cerrar</span></button></div></div>{busy === 'load' || !detail ? <div className={styles.loading}><LoaderCircle size={20} />Cargando…</div> : <div className={styles.sheetBody}>
      {notice ? <p className={notice.kind === 'error' ? styles.error : styles.success}>{notice.text}</p> : null}
      {completenessIssues.length ? <section className={styles.pendingConfig}><strong>Antes de preparar la fecha</strong><ul>{completenessIssues.map(issue => <li key={competitionEventIssueCode(issue) || String(issue)}>{competitionEventIssueLabel(issue)}</li>)}</ul></section> : null}
      <form id="event-edit-form" className={styles.form} onSubmit={event => { event.preventDefault(); saveEvent(event.currentTarget) }}><fieldset className={styles.operationalFields} disabled={!detail.allowed_actions.edit || Boolean(busy)}><details><summary>Fecha <span>{localValue(detail.event.planned_starts_at, timezone).slice(0,10).split('-').reverse().join('/')} → {localValue(detail.event.planned_ends_at, timezone).slice(0,10).split('-').reverse().join('/')}</span></summary><div><label>Nombre<input name="name" disabled={!fieldEditable('structure')} required defaultValue={detail.event.name} />{fieldLock('structure')}</label><label>Tipo<select name="type" disabled={!fieldEditable('structure')} defaultValue={detail.event.event_type}><option value="STANDARD">Competitivo</option><option value="EXHIBITION">Exhibición</option><option value="FRIENDLY">Amistoso</option></select></label><label>Inicio<input name="start" disabled={!fieldEditable('structure')} required type="datetime-local" defaultValue={localValue(detail.event.planned_starts_at, timezone)} /></label><label>Fin<input name="end" disabled={!fieldEditable('structure')} required type="datetime-local" defaultValue={localValue(detail.event.planned_ends_at, timezone)} /></label><label>Sede<input name="venue" disabled={!fieldEditable('logistics')} defaultValue={detail.event.venue_name ?? ''} />{fieldLock('logistics')}</label><label>Dirección<input name="address" disabled={!fieldEditable('logistics')} defaultValue={detail.event.venue_address ?? ''} /></label><label>Visibilidad en el circuito<select name="visibility" disabled={!fieldEditable('logistics')} defaultValue={String(detail.event.is_public)}><option value="false">Sólo administración</option><option value="true">Pública en el circuito</option></select></label><label>Zona horaria<TimezoneSelector value={timezone} disabled={!fieldEditable('timezone')} onChange={setTimezone} />{fieldLock('timezone')}<small>{detail.event.timezone ? 'Inicio y Fin usan esta zona horaria.' : 'Propuesta del dispositivo. Se guardará al guardar la configuración.'}</small></label></div></details></fieldset></form>
      {activeDivisions.map(division => {
        const tournamentId = String(division.active_tournament_link?.tournament_id ?? '')
        return tournamentId ? <EventTournamentConfiguration key={`${division.id}:${tournamentId}`} clubId={clubId} tournamentId={tournamentId} timezone={timezone} request={request} onSaved={async () => { await loadDetail(detail.event.id, false); await reload() }} /> : null
      })}
      <details className={styles.disclosure}><summary>Competencia <span>{activeDivisions.length} divisiones</span></summary><div><p className={styles.autoSave}>Reglas heredadas del circuito. Los cambios de modalidad, nivel o esquema se guardan al elegir una opción.</p>{fieldLock('structure')}{activeDivisions.map(division => {
        const configure = (mode: string, tierId: string | null, schemeId: string | null) => void mutate(`score-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}`, json({ scoring_mode: mode, event_tier_id: mode === 'POINTS' ? tierId : null, points_scheme_override_id: mode === 'POINTS' ? schemeId : null, points_multiplier_override: mode === 'POINTS' ? 1 : null }, 'PATCH', detail.event.revision)), 'Configuración deportiva actualizada.')
        return <article className={styles.division} key={String(division.id)}><header><strong>{String(series.divisions.find(item => item.id === division.series_division_id)?.division_snapshot?.division_name ?? divisionName(division))}</strong><button type="button" aria-label="Quitar división" disabled={!fieldEditable('structure') || division.status !== 'DRAFT' || Boolean(busy)} onClick={() => void mutate(`remove-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}`, json({ reason: 'Retirada desde administración.' }, 'DELETE', detail.event.revision)), 'División retirada.')}><Trash2 size={15} /></button></header><div className={styles.divisionGrid}>
          <label><span>Modalidad</span><select aria-label="Modalidad" disabled={!fieldEditable('structure') || division.status !== 'DRAFT' || Boolean(busy)} value={String(division.scoring_mode ?? '')} onChange={event => configure(event.target.value, tiers[0]?.id ?? null, schemes[0]?.id ?? null)}><option value="">Elegir modalidad</option><option value="POINTS">Con puntos</option><option value="NON_SCORING">Sin puntos</option></select></label>
          {division.scoring_mode === 'POINTS' ? <><label><span>Nivel</span><select aria-label="Nivel del evento" disabled={!fieldEditable('structure') || division.status !== 'DRAFT' || Boolean(busy)} value={String(division.event_tier_id ?? '')} onChange={event => configure('POINTS', event.target.value, String(division.points_scheme_override_id ?? schemes[0]?.id ?? '') || null)}><option value="">Elegir nivel</option>{tiers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Esquema</span><select aria-label="Esquema de puntos" disabled={!fieldEditable('structure') || division.status !== 'DRAFT' || Boolean(busy)} value={String(division.points_scheme_override_id ?? '')} onChange={event => configure('POINTS', String(division.event_tier_id ?? tiers[0]?.id ?? '') || null, event.target.value || null)}><option value="">Usar esquema del circuito</option>{schemes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></> : null}
          <label><span>Torneo vinculado</span><select aria-label="Torneo vinculado" disabled={!fieldEditable('structure') || division.status !== 'DRAFT' || Boolean(busy)} value={String((division.active_tournament_link as Record<string, unknown> | null)?.tournament_id ?? '')} onChange={event => { if (!event.target.value) return; void mutate(`link-${division.id}`, () => request(`${base}/${detail.event.id}/divisions/${division.id}/tournament-link`, json({ tournament_id: event.target.value, reason: 'Vinculado desde administración.' }, division.active_tournament_link ? 'PATCH' : 'POST', detail.event.revision, true)), 'Torneo vinculado.') }}><option value="">Sin torneo</option>{tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div></article>
      })}{availableDivisions.length ? <div className={styles.addDivision}><select id="event-division"><option value="">Elegir división</option>{availableDivisions.map(item => <option key={item.id} value={item.id}>{String(item.division_snapshot?.division_name ?? item.division_snapshot?.division_label ?? 'División')}</option>)}</select><button type="button" disabled={!detail.allowed_actions.edit || Boolean(busy)} onClick={() => { const id = (document.getElementById('event-division') as HTMLSelectElement | null)?.value; if (id) void mutate('add-division', () => request(`${base}/${detail.event.id}/divisions`, json({ series_division_id: id, sort_order: activeDivisions.length }, 'POST', detail.event.revision)), 'División agregada.') }}>Agregar</button></div> : null}</div></details>
      <details className={styles.disclosure}><summary>Acciones rápidas</summary><div className={styles.actions}><p>{detail.event.status === 'DRAFT' ? `${activeDivisions.length} divisiones · ${scoring === 'POINTS' ? 'Con puntos' : scoring === 'NON_SCORING' ? 'Sin puntos' : 'Configuración pendiente'}` : statusLabel[detail.event.status]}</p>{detail.allowed_actions.schedule ? <button type="button" disabled={Boolean(busy)} onClick={() => lifecycle('schedule')}>Preparar fecha</button> : null}<label>Motivo<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Motivo para cancelar" /></label>{detail.allowed_actions.cancel ? <button type="button" className={styles.danger} disabled={!reason.trim() || Boolean(busy)} onClick={() => lifecycle('cancel')}>Cancelar evento</button> : null}{detail.allowed_actions.archive ? <button type="button" disabled={Boolean(busy)} onClick={() => lifecycle('archive')}><Archive size={15} />Archivar</button> : null}</div></details>
    </div>}</aside></div> : null}
  </section>
}
