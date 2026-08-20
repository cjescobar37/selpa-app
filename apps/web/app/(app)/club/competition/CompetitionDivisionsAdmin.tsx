'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, CircleAlert, Plus, X } from 'lucide-react'
import { useSession } from '@/components/session/SessionProvider'
import { supabase } from '@/lib/supabaseClient'
import styles from './CompetitionDivisionsAdmin.module.css'

type Season = { id: string; name: string; status: 'DRAFT' | 'ACTIVE' }
type Catalog = { id: string; name: string; slug?: string; short_label?: string; min_age?: number | null; max_age?: number | null; is_active: boolean }
type CatalogKind = 'branch' | 'segment' | 'category'
type Division = { id: string; season_id: string; season: string; gender_label: string; group_label: string | null; category_label: string | null; is_active: boolean }
type Payload = { seasons: Season[]; selected_season_id: string; divisions: Division[]; catalogs: { genders: Catalog[]; groups: Catalog[]; categories: Catalog[]; age_categories: Catalog[] } }
type Notice = { kind: 'success' | 'warning' | 'error'; text: string } | null

async function accessToken() { return (await supabase.auth.getSession()).data.session?.access_token ?? '' }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw Object.assign(new Error(data.error || 'No pudimos completar la operación.'), { status: response.status })
  return data
}

function divisionLabel(division: Division) {
  return [division.gender_label, division.group_label, division.category_label].filter(Boolean).join(' · ')
}

function slugify(value: string) { return value.replace(/ª/g, 'a').replace(/º/g, 'o').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }

export default function CompetitionDivisionsAdmin() {
  const { activeClub } = useSession()
  const clubId = activeClub?.id
  const [data, setData] = useState<Payload | null>(null)
  const [seasonId, setSeasonId] = useState('')
  const [state, setState] = useState<'active' | 'inactive'>('active')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [catalogEditor, setCatalogEditor] = useState<CatalogKind | null>(null)
  const [catalogName, setCatalogName] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [form, setForm] = useState({ branch_id: '', segment_id: '', category_id: '' })

  const load = useCallback(async (requestedSeasonId = seasonId, requestedState = state) => {
    if (!clubId) return
    setLoading(true)
    try {
      const query = new URLSearchParams({ state: requestedState })
      if (requestedSeasonId) query.set('season_id', requestedSeasonId)
      const next = await request<Payload>(`/api/clubs/${clubId}/competition/divisions?${query}`)
      setData(next); setSeasonId(next.selected_season_id)
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos cargar las divisiones.' }) }
    finally { setLoading(false) }
  }, [clubId, seasonId, state])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (notice?.kind !== 'success') return
    const timeout = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const selectedGroup = data?.catalogs.groups.find((group) => group.id === form.segment_id)?.name.toLowerCase() ?? ''
  const categoryOptional = selectedGroup === 'menores' || selectedGroup === 'veteranos'
  const ageOptions = useMemo(() => (data?.catalogs.age_categories ?? []).filter((age) => selectedGroup === 'menores'
    ? age.max_age !== null && age.max_age !== undefined && age.max_age <= 18
    : selectedGroup === 'veteranos' ? age.min_age !== null && age.min_age !== undefined && age.min_age >= 18 : false), [data?.catalogs.age_categories, selectedGroup])

  function selectSeason(value: string) { setSeasonId(value); void load(value, state) }
  function selectState(value: 'active' | 'inactive') { setState(value); void load(seasonId, value) }
  function updateForm(field: keyof typeof form, value: string) {
    setForm((current) => field === 'segment_id' ? { ...current, segment_id: value, category_id: '' } : { ...current, [field]: value })
  }

  async function createDivision(event: React.FormEvent) {
    event.preventDefault()
    if (!clubId || !seasonId || !form.branch_id || !form.segment_id || (!categoryOptional && !form.category_id)) {
      setNotice({ kind: 'warning', text: 'Completá género, grupo y categoría para continuar.' }); return
    }
    setBusy('create')
    try {
      await request(`/api/clubs/${clubId}/competition/divisions`, { method: 'POST', body: JSON.stringify({ season_id: seasonId, branch_id: form.branch_id, segment_id: form.segment_id, category_id: categoryOptional ? null : form.category_id }) })
      setCreating(false); setForm({ branch_id: '', segment_id: '', category_id: '' })
      setState('active'); await load(seasonId, 'active'); setNotice({ kind: 'success', text: 'División agregada.' })
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos agregar la división.' }) }
    finally { setBusy('') }
  }

  async function toggleDivision(division: Division) {
    if (!clubId) return
    setBusy(division.id)
    try {
      await request(`/api/clubs/${clubId}/competition/divisions`, { method: 'PATCH', body: JSON.stringify({ id: division.id, is_active: !division.is_active }) })
      await load(seasonId, state); setNotice({ kind: 'success', text: division.is_active ? 'División desactivada.' : 'División activada.' })
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos actualizar la división.' }) }
    finally { setBusy('') }
  }

  async function createCatalog(event: React.FormEvent) {
    event.preventDefault()
    if (!clubId || !catalogEditor || !catalogName.trim()) { setNotice({ kind: 'warning', text: 'Ingresá un nombre para continuar.' }); return }
    const items = catalogEditor === 'branch' ? data?.catalogs.genders : catalogEditor === 'segment' ? data?.catalogs.groups : data?.catalogs.categories
    const existing = items?.find((item) => item.slug === slugify(catalogName))
    if (existing?.is_active) { setNotice({ kind: 'warning', text: `${existing.name} ya está disponible.` }); return }
    setBusy(`catalog-${catalogEditor}`)
    try {
      const result = existing
        ? await request<{ message?: string }>(`/api/clubs/${clubId}/competition/catalogs/${catalogEditor}`, { method: 'PATCH', body: JSON.stringify({ id: existing.id, is_active: true }) })
        : await request<{ message?: string }>(`/api/clubs/${clubId}/competition/catalogs/${catalogEditor}`, { method: 'POST', body: JSON.stringify({ name: catalogName.trim() }) })
      setCatalogEditor(null); setCatalogName(''); await load(seasonId, state)
      setNotice({ kind: 'success', text: result.message || (existing ? `${existing.name} fue reactivado.` : `${catalogName.trim()} fue agregado.`) })
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos agregar la opción.' }) }
    finally { setBusy('') }
  }

  async function toggleCatalog(kind: CatalogKind, item: Catalog) {
    if (!clubId) return
    setBusy(`catalog-${item.id}`)
    try {
      await request(`/api/clubs/${clubId}/competition/catalogs/${kind}`, { method: 'PATCH', body: JSON.stringify({ id: item.id, is_active: !item.is_active }) })
      await load(seasonId, state); setNotice({ kind: 'success', text: `${item.name} ${item.is_active ? 'desactivado' : 'activado'}.` })
    } catch (cause) { setNotice({ kind: 'error', text: cause instanceof Error ? cause.message : 'No pudimos actualizar la opción.' }) }
    finally { setBusy('') }
  }

  function catalogBlock(title: string, kind: CatalogKind, items: Catalog[]) {
    return <div className={styles.catalogBlock}><div className={styles.catalogHeading}><h2>{title}</h2><button type="button" onClick={() => { setCatalogName(''); setCatalogEditor(kind) }}><Plus size={15}/>Agregar</button></div><div className={styles.catalogChips}>{items.length ? items.map((item) => <button key={item.id} type="button" className={item.is_active ? styles.catalogActive : styles.catalogInactive} onClick={() => void toggleCatalog(kind, item)} disabled={busy === `catalog-${item.id}`} aria-label={`${item.is_active ? 'Desactivar' : 'Activar'} ${item.name}`} title={`${item.is_active ? 'Desactivar' : 'Activar'} ${item.name}`}>{item.short_label || item.name}<small>{item.is_active ? 'Activo' : 'Inactivo'}</small></button>) : <p>Todavía no hay opciones.</p>}</div></div>
  }

  if (!clubId) return <main className={styles.page}><p className={styles.state}>Seleccioná un club para continuar.</p></main>
  const divisions = data?.divisions ?? []
  return <main className={styles.page}>
    <header className={styles.hero}>
      <Link href="/club/competition" className={styles.back}><ArrowLeft size={17} /> Competencias</Link>
      <span>CONFIGURACIÓN</span><h1>Configuración competitiva</h1><p>Definí las categorías y divisiones que podrá usar el club.</p>
    </header>

    {notice ? <aside className={`${styles.notice} ${styles[notice.kind]}`} role="status"><CircleAlert size={18} /><p>{notice.text}</p><button type="button" onClick={() => setNotice(null)} aria-label="Cerrar mensaje"><X size={17} /></button></aside> : null}

    <section className={styles.controls} aria-label="Filtros de divisiones">
      <label>Temporada<select value={seasonId} onChange={(event) => selectSeason(event.target.value)} disabled={loading}>{data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}{season.status === 'ACTIVE' ? ' · Activa' : ''}</option>)}</select></label>
      <div className={styles.tabs}><button type="button" className={state === 'active' ? styles.tabActive : ''} onClick={() => selectState('active')}>Activas</button><button type="button" className={state === 'inactive' ? styles.tabActive : ''} onClick={() => selectState('inactive')}>Inactivas</button></div>
    </section>

    <section className={styles.catalogs} aria-label="Catálogos competitivos">
      {catalogBlock('GÉNEROS', 'branch', data?.catalogs.genders ?? [])}
      {catalogBlock('GRUPOS', 'segment', data?.catalogs.groups ?? [])}
      {catalogBlock('CATEGORÍAS', 'category', data?.catalogs.categories ?? [])}
    </section>

    <section className={styles.divisionsSection}><header><span>DIVISIONES DISPONIBLES</span><small>{state === 'active' ? 'Activas' : 'Inactivas'}</small></header><div className={styles.list} aria-live="polite">
      {loading ? <><i className={styles.skeleton}/><i className={styles.skeleton}/><i className={styles.skeleton}/></> : divisions.length ? divisions.map((division) => <article className={styles.division} key={division.id}>
        <span className={`${styles.badge} ${division.is_active ? styles.active : styles.inactive}`}>{division.is_active ? 'Activa' : 'Inactiva'}</span>
        <div><h2>{divisionLabel(division)}</h2><p>Temporada {division.season}</p>{division.group_label && !division.category_label ? <small>La categoría etaria se define al configurar el circuito.</small> : null}</div>
        <button type="button" onClick={() => void toggleDivision(division)} disabled={busy === division.id}>{division.is_active ? 'Desactivar' : 'Activar'} <ChevronRight size={16}/></button>
      </article>) : <div className={styles.empty}><strong>{state === 'active' ? 'No hay divisiones disponibles para esta temporada.' : 'No hay divisiones inactivas.'}</strong><p>{state === 'active' ? 'Agregá la primera para poder crear circuitos.' : 'Las divisiones desactivadas aparecerán acá.'}</p>{state === 'active' ? <button type="button" onClick={() => setCreating(true)}>Agregar división</button> : null}</div>}
    </div></section>

    {!creating ? <button className={styles.primary} type="button" onClick={() => setCreating(true)}><Plus size={18}/>Agregar división</button> : null}
    {creating ? <div className={styles.sheetBackdrop} role="presentation"><section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Agregar división"><header><div><span>NUEVA DIVISIÓN</span><h2>Elegí la categoría competitiva</h2></div><button type="button" onClick={() => setCreating(false)} aria-label="Cerrar"><X size={20}/></button></header><form onSubmit={createDivision}>
      <label>Género<select value={form.branch_id} onChange={(event) => updateForm('branch_id', event.target.value)}><option value="">Elegí una opción</option>{data?.catalogs.genders.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Grupo<select value={form.segment_id} onChange={(event) => updateForm('segment_id', event.target.value)}><option value="">Elegí una opción</option>{data?.catalogs.groups.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      {categoryOptional ? <div className={styles.ageOptions}><strong>Categorías etarias disponibles</strong>{ageOptions.length ? <div>{ageOptions.map((item) => <span key={item.id}>{item.name}</span>)}</div> : <p>No hay categorías etarias activas para este grupo.</p>}<small>La categoría etaria concreta se define al configurar la elegibilidad del circuito.</small></div> : <label>Categoría<select value={form.category_id} onChange={(event) => updateForm('category_id', event.target.value)}><option value="">Elegí una opción</option>{data?.catalogs.categories.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.short_label || item.name}</option>)}</select></label>}
      <footer><button className={styles.cancel} type="button" onClick={() => setCreating(false)}>Cancelar</button><button className={styles.primary} type="submit" disabled={busy === 'create'}>Agregar división</button></footer>
    </form></section></div> : null}
    {catalogEditor ? <div className={styles.sheetBackdrop} role="presentation"><section className={`${styles.sheet} ${styles.catalogSheet}`} role="dialog" aria-modal="true" aria-label="Agregar opción"><header><div><span>NUEVA OPCIÓN</span><h2>Agregar {catalogEditor === 'branch' ? 'género' : catalogEditor === 'segment' ? 'grupo' : 'categoría'}</h2></div><button type="button" onClick={() => setCatalogEditor(null)} aria-label="Cerrar"><X size={20}/></button></header>{(() => { const inactive = (catalogEditor === 'branch' ? data?.catalogs.genders : catalogEditor === 'segment' ? data?.catalogs.groups : data?.catalogs.categories)?.filter((item) => !item.is_active) ?? []; return <form onSubmit={createCatalog}>{inactive.length ? <div className={styles.reactivate}><strong>Podés recuperar</strong><div>{inactive.map((item) => <button key={item.id} type="button" onClick={() => { setCatalogName(item.name); void toggleCatalog(catalogEditor, item); setCatalogEditor(null) }}>{item.short_label || item.name}</button>)}</div></div> : null}<label>Nombre<input autoFocus value={catalogName} onChange={(event) => setCatalogName(event.target.value)} placeholder="Nombre" maxLength={80}/></label><footer><button className={styles.cancel} type="button" onClick={() => setCatalogEditor(null)}>Cancelar</button><button className={styles.primary} type="submit" disabled={busy.startsWith('catalog-') || !catalogName.trim()}>Agregar</button></footer></form> })()}</section></div> : null}
  </main>
}
