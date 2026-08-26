'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Circle, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { CompetitionSeriesDetail, CompetitionSeriesRule } from '@/features/competition/series/competition-series.types'
import styles from './SeriesDraftEditor.module.css'
import extra from './SeriesDraftAdvanced.module.css'

type Request = <T>(url: string, init?: RequestInit) => Promise<T>
type Catalog = { id: string; name: string }
type Division = { id: string; name_override: string | null; modality: string; is_active: boolean }
type Rule = CompetitionSeriesDetail['divisions'][number]['rules'][number]
type Props = { clubId: string; detail: CompetitionSeriesDetail; request: Request; reload: () => Promise<void> }

const label = (value: string) => value === 'PAIRS' ? 'Parejas' : value === 'INDIVIDUAL' ? 'Individual' : value

export default function SeriesDraftEditor({ clubId, detail, request, reload }: Props) {
  const [divisions, setDivisions] = useState<Division[]>([])
  const [schemes, setSchemes] = useState<Catalog[]>([])
  const [ages, setAges] = useState<Catalog[]>([])
  const [selectedDivision, setSelectedDivision] = useState('')
  const [selectedScheme, setSelectedScheme] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const isDraft = detail.series.status === 'DRAFT'

  useEffect(() => {
    let active = true
    async function catalogs() {
      const [divisionResult, schemeResult, ageResult] = await Promise.all([
        supabase.from('competition_divisions').select('id,name_override,modality,is_active').eq('club_id', clubId).eq('season_id', detail.series.season_id).order('sort_order'),
        supabase.from('points_schemes').select('id,name').eq('is_active', true).or(`club_id.eq.${clubId},is_global.eq.true`).order('name'),
        supabase.from('competition_age_categories').select('id,name').eq('club_id', clubId).eq('is_active', true).order('sort_order'),
      ])
      if (!active) return
      if (divisionResult.error || schemeResult.error || ageResult.error) setNotice({ kind: 'error', text: 'No pudimos cargar los catálogos competitivos.' })
      else { setDivisions((divisionResult.data ?? []) as Division[]); setSchemes((schemeResult.data ?? []) as Catalog[]); setAges((ageResult.data ?? []) as Catalog[]) }
    }
    void catalogs()
    return () => { active = false }
  }, [clubId, detail.series.season_id])

  const activeLinks = detail.divisions.filter((item) => item.is_active)
  const linkedIds = new Set(activeLinks.map((item) => item.division_id))
  const available = divisions.filter((item) => item.is_active && !linkedIds.has(item.id))
  const ruleFor = (link: CompetitionSeriesDetail['divisions'][number]) => link.rules.find((rule) => rule.status === 'ACTIVE') ?? link.rules.find((rule) => rule.status === 'DRAFT')
  const progress = useMemo(() => {
    const hasIdentity = Boolean(detail.series.code && detail.series.starts_on && detail.series.ends_on)
    const hasRules = activeLinks.length > 0 && activeLinks.every((item) => item.rules.some((rule) => rule.status === 'ACTIVE'))
    const hasEligibility = activeLinks.length > 0 && activeLinks.every((item) => item.rules.find((rule) => rule.status === 'ACTIVE')?.eligibility)
    return [hasIdentity, activeLinks.length > 0, hasRules, hasEligibility]
  }, [activeLinks, detail.series.code, detail.series.ends_on, detail.series.starts_on])
  const completed = progress.filter(Boolean).length
  const blockers = useMemo(() => {
    const missing: string[] = []
    if (!detail.series.code) missing.push('Definí el código interno.')
    if (!detail.series.starts_on || !detail.series.ends_on) missing.push('Definí las fechas de inicio y fin.')
    if (!activeLinks.length) missing.push('Agregá al menos una división.')
    activeLinks.forEach((link) => {
      const activeRule = link.rules.find((rule) => rule.status === 'ACTIVE')
      const name = String(link.division_snapshot?.division_name ?? link.division_snapshot?.division_label ?? 'una división')
      if (!activeRule) missing.push(`Activá la regla de ${name}.`)
      else {
        if (!activeRule.eligibility) missing.push(`Completá la elegibilidad de ${name}.`)
        if (!activeRule.tie_breakers.length) missing.push(`Definí un desempate para ${name}.`)
      }
    })
    return missing
  }, [activeLinks, detail.series.code, detail.series.ends_on, detail.series.starts_on])

  async function mutate(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setNotice(null)
    try { await action(); setNotice({ kind: 'ok', text: success }); await reload() }
    catch (cause) {
      const error = cause as Error & { status?: number; setupRequired?: boolean }
      if (error.status === 412) { setNotice({ kind: 'error', text: 'El circuito cambió en otra sesión. Actualizamos los datos; revisá y volvé a guardar.' }); await reload() }
      else setNotice({ kind: 'error', text: error.setupRequired ? 'Falta habilitar la estructura competitiva del club.' : error.message })
    } finally { setBusy('') }
  }

  const base = `/api/clubs/${clubId}/competition/series/${detail.series.id}`
  const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) })
  const addDivision = (divisionId = selectedDivision) => divisionId && void mutate('division-add', () => request(`${base}/divisions`, json({ division_id: divisionId, sort_order: activeLinks.length, revision: detail.series.revision })), 'División agregada.')
  const removeDivision = (id: string) => void mutate(`division-${id}`, () => request(`${base}/divisions`, json({ id, revision: detail.series.revision }, 'PATCH')), 'División retirada. Podés restaurarla mientras siga en borrador.')

  function createRule(linkId: string) {
    const schemeId = selectedScheme[linkId] || schemes[0]?.id
    if (!schemeId) { setNotice({ kind: 'error', text: 'No hay un esquema de puntos activo disponible.' }); return }
    void mutate(`rule-${linkId}`, () => request(`${base}/rules`, json({ series_division_id: linkId, points_scheme_id: schemeId, clone_rule_id: null, series_revision: detail.series.revision })), 'Regla borrador creada.')
  }

  const activateRule = (rule: CompetitionSeriesRule) => void mutate(`activate-${rule.id}`, () => request(`${base}/rules`, json({ action: 'ACTIVATE', id: rule.id, revision: rule.revision, series_revision: detail.series.revision }, 'PATCH')), 'Regla activada.')

  function saveRule(rule: CompetitionSeriesRule, form: HTMLFormElement) {
    const data = new FormData(form), mode = String(data.get('mode')), tie = String(data.get('tie'))
    const config = { points_scheme_id: String(data.get('scheme')), accumulation_mode: mode, best_results_count: mode === 'BEST_N' ? Number(data.get('best') || 1) : null, discard_worst_count: mode === 'DROP_WORST_N' ? Number(data.get('discard') || 1) : null, minimum_participations: Number(data.get('minimum') || 0), master_final_qualification_count: String(data.get('masterCount') || '') ? Number(data.get('masterCount')) : null, master_final_multiplier: Number(data.get('masterMultiplier') || 1), tie_breakers: tie ? [{ criterion: tie, params: {} }] : [] }
    void mutate(`rule-save-${rule.id}`, () => request(`${base}/rules`, json({ id: rule.id, revision: rule.revision, series_revision: detail.series.revision, config }, 'PATCH')), 'Regla guardada.')
  }

  function saveEligibility(rule: Rule, form: HTMLFormElement) {
    const data = new FormData(form), current = rule.eligibility
    const config = { requires_active_entry: data.get('active') === 'on', allow_invited_players: data.get('invited') === 'on', invited_points_policy: String(data.get('policy')), require_same_division_pair: data.get('sameDivision') === 'on', age_category_id: String(data.get('age') || '') || null, additional_rules: {} }
    void mutate(`eligibility-${rule.id}`, () => request(`${base}/eligibility`, json({ rule_id: rule.id, revision: current?.revision ?? null, series_revision: detail.series.revision, config }, 'PATCH')), 'Elegibilidad guardada.')
  }

  function clearUnexpectedAgeCategory(rule: Rule) {
    const current = rule.eligibility
    if (!current) return
    const config = {
      requires_active_entry: current.requires_active_entry,
      allow_invited_players: current.allow_invited_players,
      invited_points_policy: current.invited_points_policy,
      require_same_division_pair: current.require_same_division_pair,
      age_category_id: null,
      additional_rules: current.additional_rules,
    }
    void mutate(`eligibility-fix-${rule.id}`, () => request(`${base}/eligibility`, json({ rule_id: rule.id, revision: current.revision, series_revision: detail.series.revision, config }, 'PATCH')), 'Elegibilidad corregida. Ya podés agregar una fecha.')
  }

  function saveIdentity(form: HTMLFormElement) {
    const data = new FormData(form)
    void mutate('identity', () => request(base, json({ revision: detail.series.revision, name: detail.series.name, code: String(data.get('code') || ''), description: detail.series.description, starts_on: String(data.get('starts_on') || '') || null, ends_on: String(data.get('ends_on') || '') || null, planned_events_count: detail.series.planned_events_count, minimum_events_count: detail.series.minimum_events_count, is_public: detail.series.is_public }, 'PATCH')), 'Identidad guardada.')
  }

  return <>
    <div className={extra.seriesMeta}><span>Temporada configurada</span><span>Revisión {detail.series.revision}</span><span>{detail.series.starts_on || detail.series.ends_on ? `${detail.series.starts_on ?? '—'} · ${detail.series.ends_on ?? '—'}` : 'Fechas por definir'}</span></div>
    <section className={styles.completion} aria-label="Progreso del circuito"><div><span>{completed} de 4 etapas</span><strong>{isDraft ? blockers.length ? 'Completá el borrador' : 'Todo listo para programar' : 'Circuito programado'}</strong></div><div className={styles.progress}><i style={{ width: `${completed * 25}%` }} /></div><ol>{['Identidad', 'Divisiones', 'Reglas', 'Elegibilidad'].map((step, index) => <li key={step} className={progress[index] ? styles.done : ''}>{progress[index] ? <Check size={13} /> : <Circle size={10} />}{step}</li>)}</ol></section>
    {notice ? <p className={`${styles.notice} ${notice.kind === 'error' ? styles.noticeError : ''}`} role="status">{notice.text}</p> : null}

    {isDraft ? <details className={styles.editorSection} open><summary><span><small>00</small><strong>Identidad</strong><em>{progress[0] ? 'Completa' : 'Pendiente'}</em></span><ChevronDown size={18} /></summary><div className={styles.editorBody}><form className={styles.identityForm} onSubmit={(event) => { event.preventDefault(); saveIdentity(event.currentTarget) }}><label>Código<input name="code" defaultValue={detail.series.code ?? ''} placeholder="Ej. APERTURA-2026" maxLength={40} /></label><label>Inicio<input name="starts_on" type="date" defaultValue={detail.series.starts_on ?? ''} /></label><label>Fin<input name="ends_on" type="date" defaultValue={detail.series.ends_on ?? ''} /></label><button disabled={busy === 'identity'}>Guardar identidad</button></form></div></details> : null}

    <details className={styles.editorSection} open><summary><span><small>01</small><strong>Divisiones</strong><em>{activeLinks.length ? `${activeLinks.length} activas` : 'Pendiente'}</em></span><ChevronDown size={18} /></summary><div className={styles.editorBody}>
      {detail.divisions.map((link) => <div className={`${styles.editorRow} ${!link.is_active ? styles.inactive : ''}`} key={link.id}><div><strong>{String(link.division_snapshot?.division_name ?? link.division_snapshot?.division_label ?? divisions.find((item) => item.id === link.division_id)?.name_override ?? 'División')}</strong><small>{link.is_active ? label(divisions.find((item) => item.id === link.division_id)?.modality ?? '') : 'Retirada'}</small></div>{isDraft ? link.is_active ? <button className={styles.iconButton} disabled={busy === `division-${link.id}`} onClick={() => removeDivision(link.id)} aria-label="Retirar división"><Trash2 size={16} /></button> : <button className={styles.inlineButton} disabled={busy === 'division-add'} onClick={() => addDivision(link.division_id)}><RotateCcw size={14} />Restaurar</button> : null}</div>)}
      {isDraft ? <div className={styles.inlineForm}><select aria-label="División disponible" value={selectedDivision} onChange={(event) => setSelectedDivision(event.target.value)}><option value="">Elegir división</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name_override || `${label(item.modality)} · división`}</option>)}</select><button disabled={!selectedDivision || busy === 'division-add'} onClick={() => addDivision()}><Plus size={16} />Agregar</button></div> : null}
    </div></details>

    <details className={styles.editorSection} open><summary><span><small>02</small><strong>Reglas y elegibilidad</strong><em>{progress[2] && progress[3] ? 'Completo' : 'Pendiente'}</em></span><ChevronDown size={18} /></summary><div className={styles.editorBody}>{activeLinks.length ? activeLinks.map((link) => {
      const rule = ruleFor(link)
      const needsAgeRepair = rule?.status === 'ACTIVE' && link.division?.segment?.slug === 'libres' && Boolean(rule.eligibility?.age_category_id)
      return <article className={styles.ruleBlock} key={link.id}><header><strong>{String(link.division_snapshot?.division_name ?? link.division_snapshot?.division_label ?? 'División')}</strong><span>{rule ? `Regla v${rule.version} · ${rule.status === 'ACTIVE' ? 'Activa' : 'Borrador'}` : 'Sin regla'}</span></header>
        {!rule ? schemes.length ? <div className={styles.inlineForm}><select value={selectedScheme[link.id] ?? ''} onChange={(event) => setSelectedScheme((current) => ({ ...current, [link.id]: event.target.value }))}><option value="">Esquema de puntos</option>{schemes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={busy === `rule-${link.id}`} onClick={() => createRule(link.id)}>Crear regla</button></div> : <p className={styles.muted}>Antes de crear la regla, <Link href="/club/competition/points-schemes">configurá y activá un esquema de puntos</Link>.</p> : rule.status === 'DRAFT' ? <>
          <form className={styles.compactForm} onSubmit={(event) => { event.preventDefault(); saveRule(rule, event.currentTarget) }}><label>Esquema<select name="scheme" defaultValue={rule.points_scheme_id}>{schemes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Acumulación<select name="mode" defaultValue={rule.accumulation_mode}><option value="ALL_RESULTS">Todos los resultados</option><option value="BEST_N">Mejores resultados</option><option value="DROP_WORST_N">Descartar peores</option></select></label><label>Mínimo de participaciones<input name="minimum" type="number" min="0" defaultValue={rule.minimum_participations} /></label><details className={extra.advanced}><summary>Configuración avanzada</summary><div><label>Mejores resultados<input name="best" type="number" min="1" defaultValue={rule.best_results_count ?? 1} /></label><label>Descartar peores<input name="discard" type="number" min="1" defaultValue={rule.discard_worst_count ?? 1} /></label><label>Clasificados al Master<input name="masterCount" type="number" min="1" defaultValue={rule.master_final_qualification_count ?? ''} /></label><label>Multiplicador Master<input name="masterMultiplier" type="number" min="0.01" step="0.01" defaultValue={rule.master_final_multiplier} /></label><label>Desempate principal<select name="tie" defaultValue={typeof rule.tie_breakers[0] === 'object' && rule.tie_breakers[0] !== null && 'criterion' in rule.tie_breakers[0] ? String(rule.tie_breakers[0].criterion) : ''}><option value="">Sin criterio</option><option value="TOURNAMENT_WINS">Torneos ganados</option><option value="FINALS">Finales</option><option value="SEMIFINALS">Semifinales</option><option value="PARTICIPATIONS">Participaciones</option><option value="HEAD_TO_HEAD">Enfrentamiento directo</option></select></label></div></details><button disabled={busy === `rule-save-${rule.id}`}>Guardar regla</button></form>
          <form className={styles.checkForm} onSubmit={(event) => { event.preventDefault(); saveEligibility(rule, event.currentTarget) }}><label><input name="active" type="checkbox" defaultChecked={rule.eligibility?.requires_active_entry ?? true} />Exigir entrada activa</label><label><input name="sameDivision" type="checkbox" defaultChecked={rule.eligibility?.require_same_division_pair ?? true} />Pareja de la misma división</label><label><input name="invited" type="checkbox" defaultChecked={rule.eligibility?.allow_invited_players ?? false} />Permitir invitados</label><label>Invitados<select name="policy" defaultValue={rule.eligibility?.invited_points_policy ?? 'REQUIRE_ENTRY'}><option value="REQUIRE_ENTRY">Requieren entrada</option><option value="NON_SCORING">Sin puntos</option></select></label><label>Categoría de edad<select name="age" defaultValue={rule.eligibility?.age_category_id ?? ''}><option value="">Sin restricción</option>{ages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button disabled={busy === `eligibility-${rule.id}`}>Guardar elegibilidad</button></form>
          <button className={styles.activate} disabled={!rule.eligibility || busy === `activate-${rule.id}`} onClick={() => activateRule(rule)}>Activar regla</button>
        </> : needsAgeRepair ? <><p className={styles.ready}><TriangleAlert size={15} />Libres no usa categoría de edad.</p><button className={styles.activate} disabled={busy === `eligibility-fix-${rule.id}`} onClick={() => clearUnexpectedAgeCategory(rule)}>Corregir elegibilidad</button></> : <p className={styles.ready}><Check size={15} />Regla y elegibilidad activas</p>}
      </article>
    }) : <p className={styles.muted}>Agregá una división para configurar sus reglas.</p>}</div></details>

    {!isDraft ? <p className={styles.muted}>La agenda se administra desde la pestaña Fechas.</p> : null}
  </>
}
